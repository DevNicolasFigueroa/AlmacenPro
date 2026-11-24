// Modelo del cierre de caja (spec 005). Un cierre es la constancia definitiva de lo contado al
// terminar el turno de una persona: solo se inserta, nunca se modifica ni se borra. Es una copia de
// lo calculado en ese momento, así una anulación posterior no cambia un cierre ya hecho (RF-22, RF-23).
//
// Turno de una persona = lo que vendió (ventas completadas suyas) y cobró (abonos suyos no anulados)
// después de su cierre anterior y hasta su cierre actual, ambos extremos incluidos en el cierre que lo
// contiene: (cierre anterior, cierre actual].
import { pool } from '../config/db.js';
import { calcularCierre } from '../utils/cierres.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

const COLUMNAS_MONTOS = [
  'fondo_inicial', 'efectivo_contado', 'efectivo_esperado', 'diferencia', 'efectivo_devuelto',
  'ventas_efectivo', 'ventas_debito', 'ventas_credito', 'ventas_fiado',
  'abonos_efectivo', 'abonos_debito', 'abonos_credito', 'abonos_transferencia',
];

// Los montos llegan como texto de MySQL; la respuesta usa números y agrega el estado del cierre.
function convertirCierre(fila) {
  const cierre = { ...fila, cantidad_ventas: Number(fila.cantidad_ventas) };
  for (const columna of COLUMNAS_MONTOS) cierre[columna] = aNumero(fila[columna]);
  delete cierre.turno_clave;
  cierre.estado = cierre.diferencia === 0 ? 'cuadra' : cierre.diferencia > 0 ? 'sobra' : 'falta';
  return cierre;
}

const SELECCION_CIERRE = `SELECT c.*, u.nombre AS usuario_nombre, u.usuario AS usuario_acceso
                          FROM cierres_caja c
                          JOIN usuarios u ON u.id = c.usuario_id`;

// El cierre anterior de la persona (el último que hizo), o null si nunca ha cerrado.
async function ultimoCierre(conexion, usuarioId) {
  const [filas] = await conexion.query(
    `SELECT id, cerrado_en, efectivo_contado
     FROM cierres_caja WHERE usuario_id = :usuarioId ORDER BY id DESC LIMIT 1`,
    { usuarioId }
  );
  return filas[0] ? { ...filas[0], efectivo_contado: aNumero(filas[0].efectivo_contado) } : null;
}

// Primera venta o abono de la persona después de "despuesDe" (o desde siempre si es null) y hasta
// "hasta". Es el inicio del turno que se muestra; null si todavía no hubo movimientos.
async function primeraActividad(conexion, usuarioId, despuesDe, hasta) {
  const [[fila]] = await conexion.query(
    `SELECT MIN(fecha) AS desde FROM (
       SELECT fecha FROM ventas
        WHERE usuario_id = :usuarioId AND estado IN ('completada', 'anulada')
          AND (:despuesDe IS NULL OR fecha > :despuesDe) AND fecha <= :hasta
       UNION ALL
       SELECT fecha FROM fiado_transacciones
        WHERE usuario_id = :usuarioId AND tipo = 'abono'
          AND (:despuesDe IS NULL OR fecha > :despuesDe) AND fecha <= :hasta
     ) actividad`,
    { usuarioId, despuesDe, hasta }
  );
  return fila.desde ?? null;
}

// RF-19: lo vendido y cobrado por la persona en el turno (despuesDe, hasta], y el efectivo que devolvió
// al anular algo que ya estaba en un cierre. Una venta o un abono anulados antes del cierre de su turno
// ya no suman (no son completadas ni vigentes) y no se descuentan: así no se cuenta dos veces. Los
// anulados después del cierre no cambian ese cierre y se descuentan aquí, en el turno de quien anula (RF-23).
async function calcularTurno(conexion, usuarioId, despuesDe, hasta) {
  const parametros = { usuarioId, despuesDe, hasta };

  const [ventas] = await conexion.query(
    `SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
     FROM ventas
     WHERE usuario_id = :usuarioId AND estado = 'completada'
       AND (:despuesDe IS NULL OR fecha > :despuesDe) AND fecha <= :hasta
     GROUP BY metodo_pago`,
    parametros
  );
  const [abonos] = await conexion.query(
    `SELECT t.metodo_pago, COALESCE(SUM(t.monto), 0) AS total
     FROM fiado_transacciones t
     WHERE t.tipo = 'abono' AND t.usuario_id = :usuarioId
       AND (:despuesDe IS NULL OR t.fecha > :despuesDe) AND t.fecha <= :hasta
       AND NOT EXISTS (SELECT 1 FROM fiado_transacciones a WHERE a.abono_anulado_id = t.id)
     GROUP BY t.metodo_pago`,
    parametros
  );
  const [[devueltoVentas]] = await conexion.query(
    `SELECT COALESCE(SUM(v.total), 0) AS total
     FROM ventas v
     WHERE v.estado = 'anulada' AND v.metodo_pago = 'efectivo' AND v.anulada_por = :usuarioId
       AND (:despuesDe IS NULL OR v.anulada_en > :despuesDe) AND v.anulada_en <= :hasta
       AND EXISTS (SELECT 1 FROM cierres_caja c
                    WHERE c.usuario_id = v.usuario_id AND c.cerrado_en >= v.fecha AND c.cerrado_en <= v.anulada_en)`,
    parametros
  );
  const [[devueltoAbonos]] = await conexion.query(
    `SELECT COALESCE(SUM(t.monto), 0) AS total
     FROM fiado_transacciones t
     JOIN fiado_transacciones a ON a.abono_anulado_id = t.id
     WHERE t.tipo = 'abono' AND t.metodo_pago = 'efectivo' AND a.usuario_id = :usuarioId
       AND (:despuesDe IS NULL OR a.fecha > :despuesDe) AND a.fecha <= :hasta
       AND EXISTS (SELECT 1 FROM cierres_caja c
                    WHERE c.usuario_id = t.usuario_id AND c.cerrado_en >= t.fecha AND c.cerrado_en <= a.fecha)`,
    parametros
  );

  const ventasPorMetodo = Object.fromEntries(['efectivo', 'debito', 'credito', 'fiado'].map((m) => [m, 0]));
  let cantidadVentas = 0;
  for (const fila of ventas) {
    ventasPorMetodo[fila.metodo_pago] = aNumero(fila.total);
    cantidadVentas += Number(fila.cantidad);
  }
  const abonosPorMetodo = Object.fromEntries(['efectivo', 'debito', 'credito', 'transferencia'].map((m) => [m, 0]));
  for (const fila of abonos) {
    if (fila.metodo_pago in abonosPorMetodo) abonosPorMetodo[fila.metodo_pago] = aNumero(fila.total);
  }

  return {
    cantidadVentas,
    ventas: ventasPorMetodo,
    abonos: abonosPorMetodo,
    efectivoDevuelto: aNumero(devueltoVentas.total) + aNumero(devueltoAbonos.total),
  };
}

async function hayVentaEnCurso(conexion, usuarioId) {
  const [filas] = await conexion.query(
    "SELECT 1 FROM ventas WHERE usuario_id = :usuarioId AND estado = 'en_curso' LIMIT 1",
    { usuarioId }
  );
  return filas.length > 0;
}

// RF-17, RF-18: lo que la persona necesita para cerrar. Nunca incluye ventas, abonos ni el efectivo
// esperado: el conteo es a ciegas hasta que confirma el cierre.
export async function turnoActual(usuarioId, hasta) {
  const anterior = await ultimoCierre(pool, usuarioId);
  return {
    desde: await primeraActividad(pool, usuarioId, anterior?.cerrado_en ?? null, hasta),
    cierre_anterior_id: anterior?.id ?? null,
    fondo_sugerido: anterior?.efectivo_contado ?? null,
    venta_en_curso: await hayVentaEnCurso(pool, usuarioId),
  };
}

// RF-16 a RF-24: cierra el turno de la persona en UNA transacción, todo o nada. Bloquea la fila de la
// persona (dos cierres suyos a la vez se ejecutan uno tras otro) y exige que el cierre anterior que
// la pantalla conocía siga siendo el último: si ya no lo es, el turno ya se cerró (RF-24).
export async function cerrar({
  usuarioId, cierreAnteriorId, fondoInicial, efectivoContado, observacion, hoy,
}) {
  // Los segundos enteros evitan que el redondeo de la columna deje un movimiento fuera de su turno.
  const hasta = new Date(Math.floor(hoy.getTime() / 1000) * 1000);
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    await conexion.query('SELECT id FROM usuarios WHERE id = :usuarioId FOR UPDATE', { usuarioId });

    const anterior = await ultimoCierre(conexion, usuarioId);
    if ((anterior?.id ?? null) !== cierreAnteriorId) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'TURNO_YA_CERRADO',
        mensaje: 'Este turno ya se cerró. Recarga la pantalla para ver tu cierre',
      };
    }
    if (await hayVentaEnCurso(conexion, usuarioId)) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'VENTA_EN_CURSO',
        mensaje: 'Tienes una venta en curso: termínala o cancélala antes de cerrar tu turno',
      };
    }

    const turno = await calcularTurno(conexion, usuarioId, anterior?.cerrado_en ?? null, hasta);
    const resultado = calcularCierre({
      fondoInicial,
      efectivoVentas: turno.ventas.efectivo,
      efectivoAbonos: turno.abonos.efectivo,
      efectivoDevuelto: turno.efectivoDevuelto,
      efectivoContado,
    });
    const desde = await primeraActividad(conexion, usuarioId, anterior?.cerrado_en ?? null, hasta);

    const [insercion] = await conexion.query(
      `INSERT INTO cierres_caja
         (usuario_id, cierre_anterior_id, desde, cerrado_en, fondo_inicial, efectivo_contado, efectivo_esperado,
          diferencia, efectivo_devuelto, cantidad_ventas, ventas_efectivo, ventas_debito, ventas_credito,
          ventas_fiado, abonos_efectivo, abonos_debito, abonos_credito, abonos_transferencia, observacion)
       VALUES
         (:usuarioId, :cierreAnteriorId, :desde, :hasta, :fondoInicial, :efectivoContado, :efectivoEsperado,
          :diferencia, :efectivoDevuelto, :cantidadVentas, :ventasEfectivo, :ventasDebito, :ventasCredito,
          :ventasFiado, :abonosEfectivo, :abonosDebito, :abonosCredito, :abonosTransferencia, :observacion)`,
      {
        usuarioId,
        cierreAnteriorId: anterior?.id ?? null,
        desde,
        hasta,
        fondoInicial,
        efectivoContado,
        efectivoEsperado: resultado.efectivoEsperado,
        diferencia: resultado.diferencia,
        efectivoDevuelto: turno.efectivoDevuelto,
        cantidadVentas: turno.cantidadVentas,
        ventasEfectivo: turno.ventas.efectivo,
        ventasDebito: turno.ventas.debito,
        ventasCredito: turno.ventas.credito,
        ventasFiado: turno.ventas.fiado,
        abonosEfectivo: turno.abonos.efectivo,
        abonosDebito: turno.abonos.debito,
        abonosCredito: turno.abonos.credito,
        abonosTransferencia: turno.abonos.transferencia,
        observacion,
      }
    );

    await conexion.commit();
    return { ok: true, id: insercion.insertId };
  } catch (error) {
    await conexion.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      // Red de seguridad: el índice único impide dos cierres del mismo turno.
      return {
        ok: false,
        codigo: 'TURNO_YA_CERRADO',
        mensaje: 'Este turno ya se cerró. Recarga la pantalla para ver tu cierre',
      };
    }
    throw error;
  } finally {
    conexion.release();
  }
}

// RF-25, RF-26: detalle de un cierre con quién lo hizo (aunque esa cuenta se desactive, RF-30).
export async function obtener(id) {
  const [filas] = await pool.query(`${SELECCION_CIERRE} WHERE c.id = :id`, { id });
  return filas[0] ? convertirCierre(filas[0]) : null;
}

// RF-25: cierres con fecha de cierre en [inicio, fin), del más reciente al más antiguo; con
// usuarioId, solo los de esa persona.
export async function listar({ inicio, fin, usuarioId = null }) {
  const [filas] = await pool.query(
    `${SELECCION_CIERRE}
     WHERE c.cerrado_en >= :inicio AND c.cerrado_en < :fin AND (:usuarioId IS NULL OR c.usuario_id = :usuarioId)
     ORDER BY c.cerrado_en DESC, c.id DESC`,
    { inicio, fin, usuarioId }
  );
  return filas.map(convertirCierre);
}

// RF-27: personas con ventas o abonos desde su último cierre que todavía no cierran, incluidas las
// cuentas desactivadas. Trae desde cuándo y cuánto efectivo han cobrado en ese tiempo.
export async function turnosSinCerrar(hasta) {
  const [usuarios] = await pool.query('SELECT id, nombre, usuario, activo FROM usuarios ORDER BY nombre');
  const resultado = [];
  for (const usuario of usuarios) {
    const anterior = await ultimoCierre(pool, usuario.id);
    const turno = await calcularTurno(pool, usuario.id, anterior?.cerrado_en ?? null, hasta);
    const hayAbonos = Object.values(turno.abonos).some((monto) => monto > 0);
    if (turno.cantidadVentas === 0 && !hayAbonos) continue;

    resultado.push({
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      activo: Boolean(usuario.activo),
      desde: await primeraActividad(pool, usuario.id, anterior?.cerrado_en ?? null, hasta),
      cantidad_ventas: turno.cantidadVentas,
      efectivo_cobrado: turno.ventas.efectivo + turno.abonos.efectivo,
    });
  }
  return resultado;
}
