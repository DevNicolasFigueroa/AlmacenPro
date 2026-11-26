// Crea (o reinicia) la base de la demostración con sus dos cuentas: un administrador y un cajero.
// Uso, desde backend/:  npm run demo
//
// La base se llama "almacenpro_demo" salvo que se indique otra con DEMO_DB_NAME. Se usa una variable
// propia y no DB_NAME porque el .env apunta a la base real del almacén: así este script nunca la borra.
// Todo lo que haya en la base demo se elimina y se vuelve a crear desde database/schema.sql.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const nombreBase = process.env.DEMO_DB_NAME ?? 'almacenpro_demo';

if (nombreBase === 'almacenpro' || !/^[A-Za-z0-9_]+$/.test(nombreBase)) {
  console.error(`No se puede usar "${nombreBase}" como base demo: elige otro nombre en DEMO_DB_NAME.`);
  process.exit(1);
}

// El pool y los modelos leen DB_NAME al importarse: se redirigen a la base demo antes de cargarlos.
process.env.DB_NAME = nombreBase;
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

    // schema.sql crea y usa "almacenpro": se redirige a la base demo.
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
  console.log(`Base demo "${nombreBase}" lista con ${CUENTAS_DEMO.length} cuentas:`);
  for (const cuenta of CUENTAS_DEMO) {
    console.log(`  ${cuenta.rol.padEnd(13)} usuario: ${cuenta.usuario.padEnd(12)} contraseña: ${cuenta.password}`);
  }
  console.log('Para verlas en el inicio de sesión, arranca el servidor con');
  console.log(`  DB_NAME=${nombreBase} MODO_DEMO=true`);
} catch (error) {
  console.error('No se pudo crear la base demo. Revisa la conexión a MySQL en el .env.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
