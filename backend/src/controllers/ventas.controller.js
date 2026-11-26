// Controlador de la venta: ciclo de la venta en curso (spec 001) y su carrito (spec 003).
import * as ventasModelo from '../models/ventas.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import { estadoInactividadVenta, segundosParaCancelar } from '../utils/validaciones.js';
import { estadoStock } from '../utils/inventario.js';
import { formatearRut } from '../utils/rut.js';
import {
  estadoCuenta,
  formatearPesos,
  normalizarMotivo,
  rangoDeFechas,
} from '../utils/ventas.js';

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

function leerIdVenta(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(404, 'No se encontró la venta indicada');
  }
  return id;
}

// RF-22: el cliente es opcional (solo el fiado lo exige, y eso lo valida el modelo).
function leerClienteId(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(400, 'El cliente indicado no es válido');
  }
  return id;
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

export async function cancelarVenta(req, res) {
  await obtenerVentaEnCurso(req.params.id, req.usuario);

  const resultado = await ventasModelo.cancelar(Number(req.params.id), new Date());
  if (resultado.noEncontrada) {
    throw new ErrorApi(409, 'La venta ya no está activa');
  }
  res.json({ mensaje: 'Venta cancelada. Ya puedes cerrar tu sesión' });
}

// Estados que acepta el filtro del historial. "canceladas" agrupa la cancelación manual y la
// automática por inactividad.
const FILTROS_ESTADO = {
  completada: ['completada'],
  anulada: ['anulada'],
  canceladas: ['cancelada', 'cancelada_automaticamente'],
  cancelada: ['cancelada'],
  cancelada_automaticamente: ['cancelada_automaticamente'],
};

// RF-35–37: historial de gestión (solo administrador). Hoy por defecto; con el resumen del
// período completo, sin importar el filtro de estado de la tabla.
export async function listar(req, res) {
  const rango = rangoDeFechas({ desde: req.query.desde, hasta: req.query.hasta }, new Date());
  if (!rango.ok) throw new ErrorApi(400, rango.mensaje);

  const filtro = req.query.estado;
  if (filtro && !FILTROS_ESTADO[filtro]) {
    throw new ErrorApi(400, 'El filtro de estado no es válido');
  }

  const periodo = { inicio: rango.inicio, fin: rango.fin };
  const [ventas, resumen] = await Promise.all([
    ventasModelo.listarHistorial({ ...periodo, estados: filtro ? FILTROS_ESTADO[filtro] : [] }),
    ventasModelo.resumenHistorial(periodo),
  ]);

  res.json({ desde: rango.desde, hasta: rango.hasta, ventas, resumen });
}

// RF-38, RF-39: detalle de una venta ya cerrada (solo administrador).
export async function detalle(req, res) {
  const id = leerIdVenta(req.params.id);
  const venta = await ventasModelo.obtenerDetalle(id);
  if (!venta || venta.estado === 'en_curso') {
    throw new ErrorApi(404, 'No se encontró la venta indicada');
  }
  res.json({ ...venta, cliente_rut_formateado: venta.cliente_rut ? formatearRut(venta.cliente_rut) : null });
}

// RF-14–19, RF-25–34: confirma la venta. Una segunda confirmación no registra nada y responde
// 409 con el estado real de la venta (doble clic o reintento tras un corte de conexión).
export async function confirmarVenta(req, res) {
  const id = leerIdVenta(req.params.id);
  const venta = await ventasModelo.buscarPorId(id);
  if (!venta) throw new ErrorApi(404, 'No se encontró la venta indicada');
  if (venta.usuario_id !== req.usuario.id && req.usuario.rol !== 'administrador') {
    throw new ErrorApi(403, 'No tienes permisos para actuar sobre esta venta');
  }

  const clienteId = leerClienteId(req.body?.cliente_id);
  const resultado = await ventasModelo.confirmar({
    ventaId: id,
    usuarioId: req.usuario.id,
    metodoPago: req.body?.metodo_pago,
    clienteId,
    montoRecibido: req.body?.monto_recibido,
    hoy: new Date(),
  });
  if (!resultado.ok) lanzarRechazo(resultado);

  // RF-32: el estado de stock de lo vendido se recalcula con el stock nuevo.
  const productos = resultado.productos.map((producto) => ({
    ...producto,
    estado_stock: estadoStock({
      stock: producto.stock,
      stockMinimo: producto.stock_minimo,
      activo: producto.activo,
    }),
  }));

  res.json({
    mensaje: 'Venta confirmada',
    venta: resultado.venta,
    vuelto: resultado.vuelto,
    cliente: resultado.saldo === null ? null : { saldo: resultado.saldo, estado: estadoCuenta(resultado.saldo) },
    productos,
  });
}

// RF-42–48: anula una venta completada (solo administrador), con motivo obligatorio.
export async function anularVenta(req, res) {
  const id = leerIdVenta(req.params.id);
  const motivo = normalizarMotivo(req.body?.motivo);
  if (!motivo.ok) throw new ErrorApi(400, motivo.mensaje);

  const resultado = await ventasModelo.anular({
    ventaId: id,
    usuarioId: req.usuario.id,
    motivo: motivo.motivo,
    hoy: new Date(),
  });
  if (!resultado.ok) lanzarRechazo(resultado);

  const aFavor = resultado.saldo !== null && resultado.saldo < 0;
  res.json({
    mensaje: aFavor
      ? `Venta anulada. El cliente queda con ${formatearPesos(-resultado.saldo)} a su favor`
      : 'Venta anulada. El stock volvió al inventario',
    saldo: resultado.saldo,
    estado_cuenta: resultado.saldo === null ? null : estadoCuenta(resultado.saldo),
  });
}
