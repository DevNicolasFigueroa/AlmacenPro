// Modelo del historial de stock (spec 002): tabla "movimientos_stock".
// Es de solo inserción: no existen funciones para modificar ni borrar movimientos (RF-29).
import { pool } from '../config/db.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

// Se ejecuta con la conexión de la transacción que cambia el stock (RNF-2), de modo que el
// movimiento y el nuevo stock se guardan juntos o no se guarda ninguno.
// Recibe la fila que arma armarMovimiento (utils/inventario.js).
export async function insertar(conexion, movimiento) {
  const [resultado] = await conexion.query(
    `INSERT INTO movimientos_stock
       (producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues, nota, venta_id, creado_en)
     VALUES
       (:productoId, :usuarioId, :tipo, :cantidad, :stockAntes, :stockDespues, :nota, :ventaId, :creadoEn)`,
    {
      productoId: movimiento.productoId,
      usuarioId: movimiento.usuarioId,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      stockAntes: movimiento.stockAntes,
      stockDespues: movimiento.stockDespues,
      nota: movimiento.nota ?? null,
      ventaId: movimiento.ventaId ?? null,
      creadoEn: movimiento.creadoEn,
    }
  );
  return resultado.insertId;
}

// RF-28: del más reciente al más antiguo, con la cuenta que hizo cada movimiento.
export async function listarPorProducto(productoId) {
  const [filas] = await pool.query(
    `SELECT m.id, m.producto_id, m.tipo, m.cantidad, m.stock_antes, m.stock_despues,
            m.nota, m.venta_id, m.creado_en,
            u.nombre AS usuario_nombre, u.usuario AS usuario
     FROM movimientos_stock m
     JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.producto_id = :productoId
     ORDER BY m.creado_en DESC, m.id DESC`,
    { productoId }
  );
  return filas.map((fila) => ({
    ...fila,
    cantidad: aNumero(fila.cantidad),
    stock_antes: aNumero(fila.stock_antes),
    stock_despues: aNumero(fila.stock_despues),
  }));
}
