// Controlador de productos e inventario (spec 002).
// Orquesta: valida con las funciones puras, decide mensajes y códigos HTTP y delega el SQL
// a los modelos. La interfaz no es la autoridad: toda regla se valida aquí.
import * as productosModelo from '../models/productos.model.js';
import * as movimientosModelo from '../models/movimientosStock.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import {
  estadoStock,
  hayVentaConPerdida,
  ordenarProductos,
  puedeCambiarUnidad,
  resumirAlertas,
  validarDatosProducto,
} from '../utils/inventario.js';

const ESTADOS_FILTRABLES = ['bajo', 'agotado'];

function leerId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(404, 'No se encontró el producto');
  }
  return id;
}

function conEstadoStock(producto) {
  return {
    ...producto,
    estado_stock: estadoStock({
      stock: producto.stock,
      stockMinimo: producto.stock_minimo,
      activo: producto.activo,
    }),
  };
}

// RF-17–20: ambos roles ven el mismo listado (activos y desactivados); el costo solo el administrador.
export async function listar(req, res) {
  const { buscar, categoria, estadoStock: filtroEstado } = req.query;

  let categoriaId = null;
  if (categoria !== undefined && categoria !== '') {
    categoriaId = Number(categoria);
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      throw new ErrorApi(400, 'La categoría indicada no es válida');
    }
  }
  if (filtroEstado && !ESTADOS_FILTRABLES.includes(filtroEstado)) {
    throw new ErrorApi(400, 'El filtro de stock debe ser "bajo" o "agotado"');
  }

  const productos = await productosModelo.listar({
    textoBusqueda: String(buscar ?? '').trim(),
    categoriaId,
    incluirCosto: req.usuario.rol === 'administrador',
  });

  let resultado = productos.map(conEstadoStock);
  if (filtroEstado) {
    resultado = resultado.filter((producto) => producto.estado_stock === filtroEstado);
  }
  res.json(ordenarProductos(resultado));
}

// RF-33, RF-34: solo cantidades de productos activos, sin costos.
// Spec 003, RF-2, RF-49: búsqueda del punto de venta. Solo productos activos, por nombre o por
// código de barras, con precio, unidad y stock, y sin costos (ambos roles reciben lo mismo).
const LIMITE_VENDIBLES = 30;

export async function vendibles(req, res) {
  const productos = await productosModelo.listarVendibles({
    textoBusqueda: String(req.query.buscar ?? '').trim(),
    limite: LIMITE_VENDIBLES,
  });
  res.json(productos.map(conEstadoStock));
}

export async function resumenStock(_req, res) {
  const productos = await productosModelo.listarParaResumen();
  res.json(resumirAlertas(productos));
}

export async function listarCategorias(_req, res) {
  res.json(await productosModelo.listarCategorias());
}

// RF-4: la confirmación se exige en el servidor, no solo en la pantalla.
function exigirConfirmacionDePerdida(valores, cuerpo, res) {
  if (hayVentaConPerdida(valores.precioVenta, valores.costo) && cuerpo.confirmarPerdida !== true) {
    res.status(409).json({
      codigo: 'VENTA_CON_PERDIDA',
      mensaje: 'El precio de venta es menor al costo: venderás con pérdida. Confirma para guardar',
    });
    return true;
  }
  return false;
}

// RF-5: el código de barras es único entre activos y desactivados.
async function exigirCodigoLibre(codigoBarras, excluirId) {
  if (codigoBarras === null) return;
  const otro = await productosModelo.buscarPorCodigoBarras(codigoBarras, { excluirId });
  if (otro) {
    throw new ErrorApi(409, `Ese código de barras ya lo usa «${otro.nombre}»`);
  }
}

// RF-6: un nombre repetido no bloquea, solo avisa.
async function avisosDeNombre(nombre, excluirId) {
  return (await productosModelo.existeNombre(nombre, { excluirId }))
    ? ['Ya existe un producto con ese nombre']
    : [];
}

// RF-1–8
export async function crear(req, res) {
  const resultado = validarDatosProducto(req.body, 'creacion');
  if (resultado.error) throw new ErrorApi(400, resultado.error);
  const { valores } = resultado;

  if (!(await productosModelo.existeCategoria(valores.categoriaId))) {
    throw new ErrorApi(400, 'Elige una categoría de la lista');
  }
  if (exigirConfirmacionDePerdida(valores, req.body, res)) return;
  await exigirCodigoLibre(valores.codigoBarras, null);

  const avisos = await avisosDeNombre(valores.nombre, null);
  const id = await productosModelo.crear({
    valores,
    usuarioId: req.usuario.id,
    hoy: new Date(),
  });
  res.status(201).json({ mensaje: 'Producto creado correctamente', id, avisos });
}

// RF-9–12: "stock" y "activo" del cuerpo se ignoran (lista blanca en validarDatosProducto y el modelo).
export async function editar(req, res) {
  const id = leerId(req);
  const producto = await productosModelo.buscarPorId(id);
  if (!producto) throw new ErrorApi(404, 'No se encontró el producto');

  const resultado = validarDatosProducto(req.body, 'edicion');
  if (resultado.error) throw new ErrorApi(400, resultado.error);
  const { valores } = resultado;

  if (!(await productosModelo.existeCategoria(valores.categoriaId))) {
    throw new ErrorApi(400, 'Elige una categoría de la lista');
  }

  if (valores.unidad !== producto.unidad_medida) {
    const tieneHistoria = await productosModelo.tieneVentasOMovimientos(id);
    if (!puedeCambiarUnidad(producto.unidad_medida, valores.unidad, tieneHistoria)) {
      throw new ErrorApi(409, 'La unidad no se puede cambiar: el producto ya tiene movimientos');
    }
  }

  if (exigirConfirmacionDePerdida(valores, req.body, res)) return;
  await exigirCodigoLibre(valores.codigoBarras, id);

  const avisos = await avisosDeNombre(valores.nombre, id);
  await productosModelo.actualizar(id, valores);
  res.json({ mensaje: 'Producto actualizado correctamente', avisos });
}

// RF-13–15: desactivar o reactivar. No existe ruta de borrado.
export async function cambiarEstado(req, res) {
  const id = leerId(req);
  const { activo } = req.body ?? {};
  if (typeof activo !== 'boolean') {
    throw new ErrorApi(400, 'Indica si el producto queda activo o desactivado');
  }

  const encontrado = await productosModelo.cambiarEstado(id, activo);
  if (!encontrado) throw new ErrorApi(404, 'No se encontró el producto');

  res.json({ mensaje: activo ? 'Producto reactivado' : 'Producto desactivado' });
}

const ESTADO_POR_CODIGO_DE_AJUSTE = {
  NO_ENCONTRADO: 404,
  STOCK_INSUFICIENTE: 409,
};

// RF-22–27, RF-30, RF-32
export async function ajustar(req, res) {
  const id = leerId(req);
  const { tipo, cantidad, nota } = req.body ?? {};

  const resultado = await productosModelo.ajustarStock({
    productoId: id,
    usuarioId: req.usuario.id,
    tipo,
    cantidad,
    nota,
    hoy: new Date(),
  });

  if (!resultado.ok) {
    const estado = ESTADO_POR_CODIGO_DE_AJUSTE[resultado.codigo] ?? 400;
    return res.status(estado).json({
      codigo: resultado.codigo,
      mensaje: resultado.mensaje,
      ...(resultado.stockActual !== undefined ? { stockActual: resultado.stockActual } : {}),
    });
  }

  const producto = await productosModelo.buscarPorId(id);
  res.json({
    mensaje: 'Ajuste registrado correctamente',
    stock: resultado.stock,
    diferencia: resultado.diferencia,
    estado_stock: conEstadoStock(producto).estado_stock,
  });
}

// RF-28: historial del producto, solo lectura.
export async function listarMovimientos(req, res) {
  const id = leerId(req);
  const producto = await productosModelo.buscarPorId(id);
  if (!producto) throw new ErrorApi(404, 'No se encontró el producto');
  res.json(await movimientosModelo.listarPorProducto(id));
}
