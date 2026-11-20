// Modelo de ventas: controla el ciclo de la venta en curso (spec 001).
// Toda escritura relacionada con la sesión se hace en transacción para no dejar
// una venta cancelada sin invalidar sus tokens, ni una sesión cerrada con venta abierta.
import { pool } from '../config/db.js';

export async function buscarEnCursoPorUsuario(usuarioId) {
  const [filas] = await pool.query(
    `SELECT id, usuario_id, estado, iniciada_en, ultima_actividad
     FROM ventas
     WHERE usuario_id = :usuarioId AND estado = 'en_curso'
     ORDER BY id DESC
     LIMIT 1`,
    { usuarioId }
  );
  return filas[0] ?? null;
}

export async function buscarPorId(id) {
  const [filas] = await pool.query('SELECT * FROM ventas WHERE id = :id', { id });
  return filas[0] ?? null;
}

export async function listarEnCurso() {
  const [filas] = await pool.query(
    `SELECT id, usuario_id, ultima_actividad
     FROM ventas
     WHERE estado = 'en_curso'`
  );
  return filas;
}

// RF-23: como máximo una venta en curso por usuario. El bloqueo de la fila del
// usuario dentro de la transacción evita dos inicios simultáneos desde dos pestañas.
export async function iniciar(usuarioId, ahora) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [usuarios] = await conexion.query(
      'SELECT id FROM usuarios WHERE id = ? FOR UPDATE',
      [usuarioId]
    );
    if (usuarios.length === 0) {
      await conexion.rollback();
      return { error: 'No se encontró la cuenta indicada' };
    }

    const [existentes] = await conexion.query(
      `SELECT id FROM ventas WHERE usuario_id = ? AND estado = 'en_curso' LIMIT 1`,
      [usuarioId]
    );
    if (existentes.length > 0) {
      await conexion.rollback();
      return { conflicto: true };
    }

    const [resultado] = await conexion.query(
      `INSERT INTO ventas
         (usuario_id, fecha, total, metodo_pago, estado, iniciada_en, ultima_actividad)
       VALUES (?, ?, 0, 'efectivo', 'en_curso', ?, ?)`,
      [usuarioId, ahora, ahora]
    );

    await conexion.commit();
    return { id: resultado.insertId };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// La pertenencia de la venta se valida en el controlador según el rol.
export async function registrarActividad(ventaId, ahora) {
  const [resultado] = await pool.query(
    `UPDATE ventas
     SET ultima_actividad = ?
     WHERE id = ? AND estado = 'en_curso'`,
    [ahora, ventaId]
  );
  return resultado.affectedRows === 1;
}

// Al terminar la venta, un cajero desactivado pierde el acceso en ese mismo momento (RF-15).
export async function finalizar(ventaId) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [ventas] = await conexion.query(
      `SELECT id, usuario_id FROM ventas WHERE id = ? AND estado = 'en_curso' FOR UPDATE`,
      [ventaId]
    );
    if (ventas.length === 0) {
      await conexion.rollback();
      return { noEncontrada: true };
    }

    await conexion.query(
      `UPDATE ventas SET estado = 'completada' WHERE id = ?`,
      [ventaId]
    );
    await conexion.query(
      `UPDATE usuarios SET token_version = token_version + 1
       WHERE id = ? AND activo = 0`,
      [ventas[0].usuario_id]
    );

    await conexion.commit();
    return { ok: true };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// Cancelación manual: la venta queda como anulada y el cajero puede cerrar sesión.
export async function cancelar(ventaId) {
  const [resultado] = await pool.query(
    `UPDATE ventas SET estado = 'anulada'
     WHERE id = ? AND estado = 'en_curso'`,
    [ventaId]
  );
  return resultado.affectedRows === 1;
}

// RF-25: cancelación automática y cierre de sesión en la MISMA transacción.
export async function cancelarAutomaticamente(venta, ahora) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [resultado] = await conexion.query(
      `UPDATE ventas
       SET estado = 'cancelada_automaticamente', cancelada_en = ?
       WHERE id = ? AND estado = 'en_curso'`,
      [ahora, venta.id]
    );
    if (resultado.affectedRows === 1) {
      await conexion.query(
        'UPDATE usuarios SET token_version = token_version + 1 WHERE id = ?',
        [venta.usuario_id]
      );
    }

    await conexion.commit();
    return resultado.affectedRows === 1;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// RF-28: historial de ventas canceladas automáticamente con su cajero.
export async function listarCanceladasAutomaticamente() {
  const [filas] = await pool.query(`
    SELECT v.id, v.fecha, v.iniciada_en, v.ultima_actividad, v.cancelada_en, v.total,
           u.id AS usuario_id, u.nombre AS cajero_nombre, u.usuario AS cajero_usuario
    FROM ventas v
    INNER JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.estado = 'cancelada_automaticamente'
    ORDER BY v.cancelada_en DESC
  `);
  return filas;
}
