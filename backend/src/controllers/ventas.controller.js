// Controlador de la venta: ciclo de la venta en curso (spec 001) y su carrito (spec 003).
import * as ventasModelo from '../models/ventas.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import { estadoInactividadVenta, segundosParaCancelar } from '../utils/validaciones.js';

// Código HTTP de cada rechazo que informan los modelos; lo no listado es un conflicto (409).
const ESTADO_POR_CODIGO = {
  VENTA_NO_ENCONTRADA: 404,
  PRODUCTO_NO_ENCONTRADO: 404,
  LINEA_NO_ENCONTRADA: 404,
  CANTIDAD_INVALIDA: 400,
  SUBTOTAL_CERO: 400,
  MONTO_INVALIDO: 400,
  METODO_INVALIDO: 400,
  FIADO_SIN_CLIENTE: 400,
  MONTO_INSUFICIENTE: 400,
  CLIENTE_NO_ENCONTRADO: 400,
};

// Convierte un { ok: false, codigo, mensaje, ... } del modelo en el error de la API, conservando
// el código y los datos que la pantalla necesita (stock disponible, problemas por línea...).
function lanzarRechazo({ ok: _ok, mensaje, ...datos }) {
  throw new ErrorApi(ESTADO_POR_CODIGO[datos.codigo] ?? 409, mensaje, datos);
}

async function obtenerVentaEnCurso(idVenta, usuario) {
  const venta = await ventasModelo.buscarPorId(Number(idVenta));
  if (!venta || venta.estado !== 'en_curso') {
    throw new ErrorApi(404, 'No se encontró la venta en curso indicada');
  }
  if (venta.usuario_id !== usuario.id && usuario.rol !== 'administrador') {
    throw new ErrorApi(403, 'No tienes permisos para actuar sobre esta venta');
  }
  return venta;
}

// RF-12, RF-30: la venta en curso con su carrito y total, y la última venta confirmada de la
// persona, para mostrar el estado real si se cortó la conexión al confirmar.
export async function enCurso(req, res) {
  const hoy = new Date();
  const venta = await ventasModelo.buscarEnCursoPorUsuario(req.usuario.id);
  const ultimaVenta = await ventasModelo.buscarUltimaConfirmada(req.usuario.id);

  if (!venta) {
    return res.json({
      ventaActiva: null, lineas: [], total: 0, aviso: false, segundosParaCancelar: 0, ultimaVenta,
    });
  }

  const carrito = await ventasModelo.obtenerCarrito(venta.id);
  const estado = estadoInactividadVenta(venta.ultima_actividad, hoy);
  res.json({
    ventaActiva: venta,
    lineas: carrito.lineas,
    total: carrito.total,
    aviso: estado === 'advertir',
    segundosParaCancelar: segundosParaCancelar(venta.ultima_actividad, hoy),
    ultimaVenta,
  });
}

export async function iniciarVenta(req, res) {
  if (req.usuario.ventaActiva) {
    throw new ErrorApi(409, 'Ya tienes una venta en curso');
  }

  const resultado = await ventasModelo.iniciar(req.usuario.id, new Date());
  if (resultado.error) {
    throw new ErrorApi(404, resultado.error);
  }
  if (resultado.conflicto) {
    throw new ErrorApi(409, 'Ya tienes una venta en curso');
  }

  res.status(201).json({
    mensaje: 'Venta iniciada. Tu sesión no se interrumpirá hasta que la termines',
    venta: { id: resultado.id, estado: 'en_curso' },
  });
}

export async function registrarActividad(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  if (!(await ventasModelo.registrarActividad(Number(req.params.id), new Date()))) {
    throw new ErrorApi(409, 'La venta ya no está activa');
  }
  res.json({ mensaje: 'Actividad registrada correctamente' });
}

function leerProductoId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(400, 'Elige un producto de la lista');
  }
  return id;
}

// RF-3: sin cantidad se agrega 1.
function leerCantidad(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') {
    if (porDefecto !== undefined) return porDefecto;
    throw new ErrorApi(400, 'Indica la cantidad');
  }
  return valor;
}

function responderCarrito(res, resultado) {
  if (!resultado.ok) lanzarRechazo(resultado);
  res.json({ lineas: resultado.lineas, total: resultado.total });
}

// RF-3–8, RF-13: agrega un producto con su cantidad (1 por defecto).
export async function agregarLinea(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  responderCarrito(res, await ventasModelo.agregarLinea({
    ventaId: Number(req.params.id),
    productoId: leerProductoId(req.body?.producto_id),
    cantidad: leerCantidad(req.body?.cantidad, 1),
    hoy: new Date(),
  }));
}

// RF-6, RF-7: fija la cantidad de una línea.
export async function cambiarCantidad(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  responderCarrito(res, await ventasModelo.cambiarCantidad({
    ventaId: Number(req.params.id),
    productoId: leerProductoId(req.params.productoId),
    cantidad: leerCantidad(req.body?.cantidad),
    hoy: new Date(),
  }));
}

// RF-6: quita una línea.
export async function quitarLinea(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  responderCarrito(res, await ventasModelo.quitarLinea({
    ventaId: Number(req.params.id),
    productoId: leerProductoId(req.params.productoId),
    hoy: new Date(),
  }));
}

// RF-6: vacía el carrito; la venta sigue en curso.
export async function vaciarCarrito(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  responderCarrito(res, await ventasModelo.vaciarCarrito({
    ventaId: Number(req.params.id),
    hoy: new Date(),
  }));
}

export async function finalizarVenta(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  const resultado = await ventasModelo.finalizar(Number(req.params.id));
  if (resultado.noEncontrada) {
    throw new ErrorApi(409, 'La venta ya no está activa');
  }

  res.json({ mensaje: 'Venta finalizada correctamente' });
}

export async function cancelarVenta(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  const resultado = await ventasModelo.cancelar(Number(req.params.id), new Date());
  if (resultado.noEncontrada) {
    throw new ErrorApi(409, 'La venta ya no está activa');
  }
  res.json({ mensaje: 'Venta cancelada. Ya puedes cerrar tu sesión' });
}

export async function listar(req, res) {
  // RF-28: el historial de canceladas es información de gestión, solo del administrador.
  const estado = req.query.estado;
  if (estado && estado !== 'cancelada_automaticamente') {
    throw new ErrorApi(400, 'El filtro de estado no es válido');
  }
  res.json(await ventasModelo.listarCanceladasAutomaticamente());
}
