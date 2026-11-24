// Controlador del cierre de caja (spec 005). Cada persona que atiende el mesón, cajero o
// administrador, cierra su propio turno. El cajero solo ve sus propios cierres; el administrador ve los
// de todos y los turnos sin cerrar. Los reportes siguen siendo exclusivos del administrador.
import * as cierresModelo from '../models/cierresCaja.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import { describirDiferencia, validarEfectivo } from '../utils/cierres.js';
import { normalizarObservacion } from '../utils/clientes.js';
import { rangoDeReporte } from '../utils/reportes.js';

const DIAS_POR_DEFECTO = 7;

const ESTADO_POR_CODIGO = {};

// Convierte un { ok: false, codigo, mensaje } del modelo en el error de la API (409 por defecto).
function lanzarRechazo({ ok: _ok, mensaje, ...datos }) {
  throw new ErrorApi(ESTADO_POR_CODIGO[datos.codigo] ?? 409, mensaje, datos);
}

function leerId(valor, mensaje) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorApi(404, mensaje);
  return id;
}

// RF-17: el cierre anterior que la pantalla conocía: ninguno (null) o el número de un cierre.
function leerCierreAnterior(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(400, 'El cierre anterior no es válido: recarga la pantalla');
  }
  return id;
}

// RF-18: lo que hace falta para cerrar, sin ventas, abonos ni efectivo esperado (conteo a ciegas).
export async function turno(req, res) {
  res.json(await cierresModelo.turnoActual(req.usuario.id, new Date()));
}

// RF-16 a RF-24: cierra el turno. Devuelve el resultado completo, que recién ahora se muestra.
export async function cerrar(req, res) {
  const fondo = validarEfectivo(req.body?.fondo_inicial, 'el fondo inicial');
  if (!fondo.ok) throw new ErrorApi(400, fondo.mensaje, { codigo: 'FONDO_INVALIDO' });
  const contado = validarEfectivo(req.body?.efectivo_contado, 'el efectivo contado');
  if (!contado.ok) throw new ErrorApi(400, contado.mensaje, { codigo: 'EFECTIVO_INVALIDO' });
  const observacion = normalizarObservacion(req.body?.observacion);
  if (!observacion.ok) throw new ErrorApi(400, observacion.mensaje);

  const resultado = await cierresModelo.cerrar({
    usuarioId: req.usuario.id,
    cierreAnteriorId: leerCierreAnterior(req.body?.cierre_anterior_id),
    fondoInicial: fondo.monto,
    efectivoContado: contado.monto,
    observacion: observacion.observacion,
    hoy: new Date(),
  });
  if (!resultado.ok) lanzarRechazo(resultado);

  const cierre = await cierresModelo.obtener(resultado.id);
  res.status(201).json({
    mensaje: 'Turno cerrado',
    cierre,
    resultado: { estado: cierre.estado, diferencia: cierre.diferencia, texto: describirDiferencia(cierre.diferencia) },
  });
}

// RF-25, RF-26: lista de cierres. El administrador ve los de todos (y puede filtrar por persona); el
// cajero solo los suyos, sin importar lo que pida. Sin fechas, los últimos 7 días.
export async function listar(req, res) {
  const hoy = new Date();
  let { desde, hasta } = req.query;
  if ((desde === undefined || desde === '') && (hasta === undefined || hasta === '')) {
    const dia = (fecha) => {
      const dos = (n) => String(n).padStart(2, '0');
      return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
    };
    desde = dia(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (DIAS_POR_DEFECTO - 1)));
    hasta = dia(hoy);
  }
  const rango = rangoDeReporte({ desde, hasta }, hoy);
  if (!rango.ok) throw new ErrorApi(400, rango.mensaje);

  let usuarioId = null;
  if (req.usuario.rol !== 'administrador') {
    usuarioId = req.usuario.id;
  } else if (req.query.usuario_id !== undefined && req.query.usuario_id !== '') {
    usuarioId = Number(req.query.usuario_id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      throw new ErrorApi(400, 'La persona indicada no es válida');
    }
  }

  const cierres = await cierresModelo.listar({ inicio: rango.inicio, fin: rango.fin, usuarioId });
  res.json({ desde: rango.desde, hasta: rango.hasta, cierres });
}

// RF-27: turnos sin cerrar (solo administrador; lo exige la ruta).
export async function sinCerrar(req, res) {
  res.json({ turnos: await cierresModelo.turnosSinCerrar(new Date()) });
}

// RF-25, RF-26: detalle de un cierre. Un cajero solo abre los suyos: los ajenos responden 404.
export async function detalle(req, res) {
  const id = leerId(req.params.id, 'No se encontró el cierre');
  const cierre = await cierresModelo.obtener(id);
  if (!cierre || (req.usuario.rol !== 'administrador' && cierre.usuario_id !== req.usuario.id)) {
    throw new ErrorApi(404, 'No se encontró el cierre');
  }
  res.json(cierre);
}
