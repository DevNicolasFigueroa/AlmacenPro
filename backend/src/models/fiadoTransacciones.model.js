// Modelo de las transacciones de fiado (spec 003): cargos, abonos y anulaciones.
// Es de solo inserción: no existen funciones para modificar ni borrar movimientos.
// Saldo = cargos - abonos - anulaciones (vista v_saldo_fiado); negativo = saldo a favor.
import { pool } from '../config/db.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

async function insertar(conexion, { clienteId, ventaId, usuarioId, tipo, monto, observacion, hoy }) {
  const [resultado] = await conexion.query(
    `INSERT INTO fiado_transacciones
       (cliente_id, venta_id, usuario_id, tipo, monto, observacion, fecha)
     VALUES
       (:clienteId, :ventaId, :usuarioId, :tipo, :monto, :observacion, :hoy)`,
    {
      clienteId,
      ventaId,
      usuarioId,
      tipo,
      monto,
      observacion: observacion ?? null,
      hoy,
    }
  );
  return resultado.insertId;
}

// Se ejecutan con la conexión de la transacción de la venta, de modo que el cargo y la venta
// se guardan juntos o no se guarda ninguno (principio 3). UNIQUE (venta_id, tipo) impide un
// segundo cargo o una segunda anulación de la misma venta.

// RF-25: el total de la venta al fiado queda como deuda del cliente.
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

// RF-43, RF-44: deshace el cargo de una venta anulada. Si el cliente ya había abonado, el saldo
// puede quedar bajo cero: es saldo a favor, no un error.
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

// RF-23: movimientos de la cuenta del cliente, del más reciente al más antiguo.
export async function listarPorCliente(clienteId) {
  const [filas] = await pool.query(
    `SELECT t.id, t.tipo, t.monto, t.venta_id, t.observacion, t.fecha,
            u.nombre AS usuario_nombre
     FROM fiado_transacciones t
     JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.cliente_id = :clienteId
     ORDER BY t.fecha DESC, t.id DESC`,
    { clienteId }
  );
  return filas.map((fila) => ({ ...fila, monto: aNumero(fila.monto) }));
}
