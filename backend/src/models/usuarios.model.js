// Modelo de usuarios: único lugar con SQL de la tabla "usuarios" (spec 001).
import { pool } from '../config/db.js';
import { puedeDesactivar } from '../utils/validaciones.js';

export async function buscarPorUsuario(usuario) {
  const [filas] = await pool.query('SELECT * FROM usuarios WHERE usuario = :usuario', {
    usuario,
  });
  return filas[0] ?? null;
}

export async function buscarPorId(id) {
  const [filas] = await pool.query('SELECT * FROM usuarios WHERE id = :id', { id });
  return filas[0] ?? null;
}

export async function listar() {
  const [filas] = await pool.query(`
    SELECT id, nombre, usuario, rol, activo, intentos_fallidos,
           requiere_cambio_contrasena, creado_en, actualizado_en
    FROM usuarios
    ORDER BY rol, nombre
  `);
  return filas;
}

// Un administrador recibe la contraseña elegida y un código de recuperación.
// Un cajero recibe una contraseña temporal que debe cambiar en su primer ingreso.
export async function crear({
  nombre,
  usuario,
  passwordHash,
  rol,
  codigoRecuperacionHash = null,
  requiereCambioContrasena = false,
}) {
  const [resultado] = await pool.query(
    `INSERT INTO usuarios
       (nombre, usuario, password_hash, rol, codigo_recuperacion_hash, requiere_cambio_contrasena)
     VALUES (:nombre, :usuario, :passwordHash, :rol, :codigoRecuperacionHash, :requiereCambioContrasena)`,
    {
      nombre,
      usuario,
      passwordHash,
      rol,
      codigoRecuperacionHash,
      requiereCambioContrasena: requiereCambioContrasena ? 1 : 0,
    }
  );
  return resultado.insertId;
}

// Cuenta administradores activos. Con "bloquear" fija las filas para que dos
// desactivaciones simultáneas no puedan dejar el negocio sin administrador.
export async function contarAdministradoresActivos(conexion = pool, { bloquear = false } = {}) {
  const [filas] = await conexion.query(
    `SELECT id FROM usuarios
     WHERE rol = 'administrador' AND activo = 1
     ${bloquear ? 'FOR UPDATE' : ''}`
  );
  return filas.length;
}

// RF-23, RF-24, RF-26 y RF-38: cambio de estado atómico.
// - Un administrador solo se desactiva si queda otro activo.
// - Si la cuenta tiene una venta en curso, se conserva su token para que pueda
//   terminarla o cancelarla antes de perder el acceso.
export async function cambiarEstado(id, activo) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [previos] = await conexion.query(
      'SELECT id, rol, activo FROM usuarios WHERE id = ?',
      [id]
    );
    const objetivo = previos[0];
    if (!objetivo) {
      await conexion.rollback();
      return { noEncontrada: true };
    }

    if (!activo && objetivo.rol === 'administrador' && objetivo.activo) {
      const adminsActivos = await contarAdministradoresActivos(conexion, { bloquear: true });
      if (!puedeDesactivar(objetivo.rol, objetivo.activo, adminsActivos)) {
        await conexion.rollback();
        return { ultimoAdministrador: true };
      }
    }

    const [bloqueadas] = await conexion.query(
      'SELECT id FROM usuarios WHERE id = ? FOR UPDATE',
      [id]
    );
    if (bloqueadas.length === 0) {
      await conexion.rollback();
      return { noEncontrada: true };
    }

    if (activo) {
      await conexion.query('UPDATE usuarios SET activo = 1 WHERE id = ?', [id]);
      await conexion.commit();
      return { ok: true, ventaEnCurso: false };
    }

    const [ventas] = await conexion.query(
      `SELECT id FROM ventas
       WHERE usuario_id = ? AND estado = 'en_curso'
       LIMIT 1 FOR UPDATE`,
      [id]
    );
    const ventaEnCurso = ventas.length > 0;

    await conexion.query(
      `UPDATE usuarios
       SET activo = 0,
           token_version = token_version + ?
       WHERE id = ?`,
      [ventaEnCurso ? 0 : 1, id]
    );

    await conexion.commit();
    return { ok: true, ventaEnCurso };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// Invalida los tokens emitidos anteriormente (cierre manual, cambio de clave, etc.).
export async function incrementarVersion(id) {
  await pool.query(
    'UPDATE usuarios SET token_version = token_version + 1 WHERE id = :id',
    { id }
  );
}

export async function guardarContrasena(id, passwordHash, requiereCambio = false) {
  await pool.query(
    `UPDATE usuarios
     SET password_hash = :passwordHash,
         requiere_cambio_contrasena = :requiereCambio,
         token_version = token_version + 1
     WHERE id = :id`,
    { id, passwordHash, requiereCambio: requiereCambio ? 1 : 0 }
  );
}

// RF-7 y RF-8: actualización atómica del contador y del fin del bloqueo.
export async function actualizarIntentos(id, { intentos, bloqueadoHasta }) {
  await pool.query(
    `UPDATE usuarios
     SET intentos_fallidos = :intentos,
         bloqueado_hasta = :bloqueadoHasta
     WHERE id = :id`,
    { id, intentos, bloqueadoHasta }
  );
}

export async function reiniciarIntentos(id) {
  await pool.query(
    'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = :id',
    { id }
  );
}

// RF-20 y RF-21: el código se consume solo si coincide con el guardado.
// La condición en el WHERE evita dos recuperaciones simultáneas con el mismo código.
export async function consumirCodigoRecuperacion(id, passwordHash, codigoHashAnterior) {
  const [resultado] = await pool.query(
    `UPDATE usuarios
     SET password_hash = :passwordHash,
         codigo_recuperacion_hash = NULL,
         requiere_cambio_contrasena = 0,
         token_version = token_version + 1,
         intentos_fallidos = 0,
         bloqueado_hasta = NULL
     WHERE id = :id AND codigo_recuperacion_hash = :codigoHashAnterior`,
    { id, passwordHash, codigoHashAnterior }
  );
  return resultado.affectedRows === 1;
}
