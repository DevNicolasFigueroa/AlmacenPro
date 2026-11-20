// Controlador del ciclo de vida de la venta en curso (spec 001).
// El registro transaccional de productos, stock y fiado pertenece a la spec del POS.
import * as ventasModelo from '../models/ventas.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import { estadoInactividadVenta, segundosParaCancelar } from '../utils/validaciones.js';

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

export async function enCurso(req, res) {
  const hoy = new Date();
  const venta = await ventasModelo.buscarEnCursoPorUsuario(req.usuario.id);

  if (!venta) {
    return res.json({ ventaActiva: null, aviso: false, segundosParaCancelar: 0 });
  }

  const estado = estadoInactividadVenta(venta.ultima_actividad, hoy);
  res.json({
    ventaActiva: venta,
    aviso: estado === 'advertir',
    segundosParaCancelar: segundosParaCancelar(venta.ultima_actividad, hoy),
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

  const resultado = await ventasModelo.cancelar(Number(req.params.id));
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

export function crear(_req, res) {
  res.status(501).json({ mensaje: 'Registro de ventas: implementación pendiente de la spec del POS' });
}
