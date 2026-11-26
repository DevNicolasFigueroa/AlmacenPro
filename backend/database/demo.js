// Deja la base de datos en cero y crea las dos cuentas de la demostración: un administrador y un cajero.
// Uso, desde backend/:  npm run demo -- --confirmar
//
// Trabaja sobre la base indicada en DB_NAME (.env). BORRA TODO lo que tenga (productos, ventas, fiado,
// cierres y cuentas) y la vuelve a crear desde database/schema.sql. Por eso exige --confirmar.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const nombreBase = process.env.DB_NAME ?? 'almacenpro';

if (!/^[A-Za-z0-9_]+$/.test(nombreBase)) {
  console.error(`El nombre de base "${nombreBase}" no es válido: revisa DB_NAME en el .env.`);
  process.exit(1);
}

if (!process.argv.includes('--confirmar')) {
  console.error(`Esto borrará TODOS los datos de la base "${nombreBase}" y dejará solo las cuentas demo.`);
  console.error('Respalda la base antes y vuelve a ejecutar:  npm run demo -- --confirmar');
  process.exit(1);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'no-se-usa-en-este-script';

const { pool } = await import('../src/config/db.js');
const usuariosModelo = await import('../src/models/usuarios.model.js');
const { cifrar, generarCodigoRecuperacion } = await import('../src/services/credenciales.js');
const { CUENTAS_DEMO } = await import('../src/config/demo.js');

const directorio = path.dirname(fileURLToPath(import.meta.url));
const rutaEsquema = path.resolve(directorio, 'schema.sql');

async function recrearEsquema() {
  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });
  try {
    await conexion.query(
      `CREATE DATABASE IF NOT EXISTS \`${nombreBase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conexion.query(`USE \`${nombreBase}\``);

    // Se borran las tablas y vistas en lugar de la base completa: en un servidor gestionado
    // la base suele venir creada y la cuenta puede no tener permiso para borrarla.
    const [objetos] = await conexion.query(
      `SELECT table_name AS nombre, table_type AS tipo FROM information_schema.tables
       WHERE table_schema = ?`, [nombreBase]
    );
    await conexion.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { nombre, tipo } of objetos) {
      await conexion.query(`DROP ${tipo === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS \`${nombre}\``);
    }
    await conexion.query('SET FOREIGN_KEY_CHECKS = 1');

    // schema.sql crea y usa "almacenpro": se redirige a la base de DB_NAME si se llama distinto.
    const sql = fs.readFileSync(rutaEsquema, 'utf8').replaceAll('almacenpro', nombreBase);
    await conexion.query(sql);
  } finally {
    await conexion.end();
  }
}

async function crearCuentas() {
  for (const cuenta of CUENTAS_DEMO) {
    await usuariosModelo.crear({
      nombre: cuenta.nombre,
      usuario: cuenta.usuario,
      passwordHash: await cifrar(cuenta.password),
      rol: cuenta.rol,
      // El administrador necesita un código de recuperación (spec 001); en la demo no se entrega.
      codigoRecuperacionHash: cuenta.rol === 'administrador'
        ? await cifrar(generarCodigoRecuperacion())
        : null,
      // Las contraseñas de la demo son públicas y fijas: no se piden cambiar al entrar.
      requiereCambioContrasena: false,
    });
  }
}

try {
  await recrearEsquema();
  await crearCuentas();
  console.log(`Base "${nombreBase}" en cero con ${CUENTAS_DEMO.length} cuentas demo:`);
  for (const cuenta of CUENTAS_DEMO) {
    console.log(`  ${cuenta.rol.padEnd(13)} usuario: ${cuenta.usuario.padEnd(12)} contraseña: ${cuenta.password}`);
  }
  console.log('Para verlas en el inicio de sesión, agrega MODO_DEMO=true al .env y reinicia el servidor.');
} catch (error) {
  console.error('No se pudo preparar la base demo. Revisa la conexión a MySQL en el .env.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
