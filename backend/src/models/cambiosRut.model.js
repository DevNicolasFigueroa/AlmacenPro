// Modelo de los cambios de RUT (spec 004, RF-24, RF-25): constancia de quién corrigió el RUT de un
// cliente, cuándo y de cuál a cuál. Es de solo inserción y lectura: no existen funciones para
// modificar ni borrar una constancia.
import { pool } from '../config/db.js';

// Se ejecuta con la conexión de la transacción del cambio, de modo que el RUT nuevo y su
// constancia se guardan juntos o no se guarda ninguno.
export async function insertar(conexion, { clienteId, rutAnterior, rutNuevo, usuarioId, hoy }) {
  const [resultado] = await conexion.query(
    `INSERT INTO cambios_rut (cliente_id, rut_anterior, rut_nuevo, usuario_id, creado_en)
     VALUES (:clienteId, :rutAnterior, :rutNuevo, :usuarioId, :hoy)`,
    { clienteId, rutAnterior, rutNuevo, usuarioId, hoy }
  );
  return resultado.insertId;
}

// RF-25: historial de cambios de RUT del cliente, del más reciente al más antiguo.
export async function listarPorCliente(clienteId) {
  const [filas] = await pool.query(
    `SELECT c.id, c.rut_anterior, c.rut_nuevo, c.creado_en, u.nombre AS usuario_nombre
     FROM cambios_rut c
     JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.cliente_id = :clienteId
     ORDER BY c.creado_en DESC, c.id DESC`,
    { clienteId }
  );
  return filas;
}
