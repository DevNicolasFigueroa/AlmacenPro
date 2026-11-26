// Modelo de las transacciones de fiado (specs 003 y 004): cargos, abonos y sus anulaciones.
// Es de solo inserción: no existen funciones para modificar ni borrar movimientos.
// Saldo = cargos - abonos - anulaciones de venta + anulaciones de abono (vista v_saldo_fiado);
// negativo = saldo a favor.
import { pool } from '../config/db.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

async function insertar(conexion, {
  clienteId, ventaId = null, abonoAnuladoId = null, usuarioId, tipo, monto, metodoPago = null, observacion, hoy,
}) {
  const [resultado] = await conexion.query(
    `INSERT INTO fiado_transacciones
       (cliente_id, venta_id, abono_anulado_id, usuario_id, tipo, monto, metodo_pago, observacion, fecha)
     VALUES
       (:clienteId, :ventaId, :abonoAnuladoId, :usuarioId, :tipo, :monto, :metodoPago, :observacion, :hoy)`,
    {
      clienteId,
      ventaId,
      abonoAnuladoId,
      usuarioId,
      tipo,
      monto,
      metodoPago,
      observacion: observacion ?? null,
      hoy,
    }
  );
  return resultado.insertId;
}

// Se ejecutan con la conexión de la transacción de la venta, de modo que el cargo y la venta
// se guardan juntos o no se guarda ninguno (principio 3). UNIQUE (venta_id, tipo) impide un
// segundo cargo o una segunda anulación de la misma venta.

// Spec 003, RF-25: el total de la venta al fiado queda como deuda del cliente.
export function insertarCargo(conexion, { clienteId, ventaId, usuarioId, monto, hoy }) {
  return insertar(conexion, {
    clienteId,
    ventaId,
    usuarioId,
    tipo: 'cargo',
    monto,
    observacion: `Venta al fiado n.º ${ventaId}`,
    hoy,
  });
}

// Spec 003, RF-43, RF-44: deshace el cargo de una venta anulada. Si el cliente ya había abonado,
// el saldo puede quedar bajo cero: es saldo a favor, no un error.
export function insertarAnulacion(conexion, { clienteId, ventaId, usuarioId, monto, hoy }) {
  return insertar(conexion, {
    clienteId,
    ventaId,
    usuarioId,
    tipo: 'anulacion',
    monto,
    observacion: `Anulación de la venta n.º ${ventaId}`,
    hoy,
  });
}

// Spec 004, RF-10: pago del cliente. Es general: no se asigna a una venta (venta_id nulo).
export function insertarAbono(conexion, { clienteId, usuarioId, monto, metodoPago, observacion, hoy }) {
  return insertar(conexion, {
    clienteId,
    usuarioId,
    tipo: 'abono',
    monto,
    metodoPago,
    observacion,
    hoy,
  });
}

// Spec 004, RF-16: deshace un abono mal registrado. El abono original no se modifica: la anulación
// es un movimiento nuevo que lo referencia, y UNIQUE (abono_anulado_id) impide anularlo dos veces.
export function insertarAnulacionAbono(conexion, { clienteId, usuarioId, monto, abonoAnuladoId, motivo, hoy }) {
  return insertar(conexion, {
    clienteId,
    usuarioId,
    tipo: 'anulacion_abono',
    monto,
    abonoAnuladoId,
    observacion: motivo,
    hoy,
  });
}

// RF-16, RF-17: el movimiento del cliente que se quiere anular, bloqueado dentro de la transacción,
// con la marca de si ya fue anulado. Devuelve null si no existe o es de otro cliente.
export async function buscarMovimientoParaAnular(conexion, clienteId, movimientoId) {
  const [filas] = await conexion.query(
    `SELECT id, cliente_id, tipo, monto
     FROM fiado_transacciones
     WHERE id = :movimientoId AND cliente_id = :clienteId
     FOR UPDATE`,
    { movimientoId, clienteId }
  );
  if (filas.length === 0) return null;

  const [anulaciones] = await conexion.query(
    'SELECT id FROM fiado_transacciones WHERE abono_anulado_id = :movimientoId',
    { movimientoId }
  );
  return { ...filas[0], monto: aNumero(filas[0].monto), yaAnulado: anulaciones.length > 0 };
}

// RF-7, RF-27: movimientos de la cuenta del cliente, del más reciente al más antiguo, con quién los
// registró (aunque esa cuenta se desactive). Cada abono trae el método y, si fue anulado, cuándo,
// quién y por qué; cada anulación de abono trae el abono que deshace.
export async function listarPorCliente(clienteId) {
  const [filas] = await pool.query(
    `SELECT t.id, t.tipo, t.monto, t.metodo_pago, t.venta_id, t.abono_anulado_id, t.observacion, t.fecha,
            u.nombre AS usuario_nombre,
            a.id AS anulacion_id, a.fecha AS anulado_en, a.observacion AS motivo_anulacion,
            ua.nombre AS anulado_por_nombre
     FROM fiado_transacciones t
     JOIN usuarios u ON u.id = t.usuario_id
     LEFT JOIN fiado_transacciones a ON a.abono_anulado_id = t.id
     LEFT JOIN usuarios ua ON ua.id = a.usuario_id
     WHERE t.cliente_id = :clienteId
     ORDER BY t.fecha DESC, t.id DESC`,
    { clienteId }
  );
  return filas.map(({ anulacion_id: anulacionId, ...fila }) => ({
    ...fila,
    monto: aNumero(fila.monto),
    anulado: fila.tipo === 'abono' ? anulacionId !== null : undefined,
    anulado_en: fila.tipo === 'abono' ? fila.anulado_en : undefined,
    motivo_anulacion: fila.tipo === 'abono' ? fila.motivo_anulacion : undefined,
    anulado_por_nombre: fila.tipo === 'abono' ? fila.anulado_por_nombre : undefined,
  }));
}
