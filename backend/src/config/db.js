// Pool de conexiones a MySQL usando mysql2 en modo promesa.
// Un pool evita abrir/cerrar conexiones por cada petición.
import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.puerto,
  user: env.db.usuario,
  password: env.db.contrasena,
  database: env.db.nombre,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  dateStrings: true, // fechas como texto 'YYYY-MM-DD HH:mm:ss' (evita desfases de zona horaria)
});

// Verificación de conexión al arrancar: si falla, muestra un mensaje claro.
export async function verificarConexion() {
  try {
    const conexion = await pool.getConnection();
    conexion.release();
    console.log(`Conexión a MySQL OK (base de datos: ${env.db.nombre})`);
  } catch (error) {
    console.error('No se pudo conectar a MySQL. Revisa el archivo .env y que el servicio esté activo.');
    console.error(error.message);
    process.exit(1);
  }
}
