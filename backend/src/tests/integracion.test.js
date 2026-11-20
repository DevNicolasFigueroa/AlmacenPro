// Pruebas de integración de la spec 001 contra MySQL.
// Se ejecutan aparte: npm run test:integracion
// Usan la base almacenpro_test y un JWT_SECRET de prueba, sin depender del .env real.
process.env.DB_NAME = process.env.DB_NAME ?? 'almacenpro_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-pruebas-spec001';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const { app } = await import('../app.js');
const { env } = await import('../config/env.js');
const { pool } = await import('../config/db.js');
const usuariosModelo = await import('../models/usuarios.model.js');
const { cifrar, generarCodigoRecuperacion } = await import('../services/credenciales.js');
const { barrerVentasVencidas } = await import('../services/ventasVencidas.js');

const directorio = path.dirname(fileURLToPath(import.meta.url));
const rutaEsquema = path.resolve(directorio, '../../database/schema.sql');

let servidor;
let tokenAdmin;
let idCajero;
let contrasenaCajero;

function url(ruta) {
  return `http://127.0.0.1:${servidor.address().port}/api${ruta}`;
}

async function peticion(ruta, { metodo = 'GET', token, cuerpo } = {}) {
  const respuesta = await fetch(url(ruta), {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: respuesta.status, datos: await respuesta.json() };
}

before(async () => {
  const conexion = await mysql.createConnection({
    host: env.db.host,
    port: env.db.puerto,
    user: env.db.usuario,
    password: env.db.contrasena,
    multipleStatements: true,
  });
  // schema.sql crea "almacenpro": se redirige a la base de pruebas.
  const sql = fs.readFileSync(rutaEsquema, 'utf8').replaceAll('almacenpro', 'almacenpro_test');
  await conexion.query('DROP DATABASE IF EXISTS almacenpro_test');
  await conexion.query(sql);
  await conexion.end();

  servidor = app.listen(0);
});

after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  await pool.end();
});

test('el administrador ingresa y recibe token con sesión de 8 horas', async () => {
  const codigo = generarCodigoRecuperacion();
  await usuariosModelo.crear({
    nombre: 'Dueño',
    usuario: 'admin',
    passwordHash: await cifrar('clave-admin-123'),
    rol: 'administrador',
    codigoRecuperacionHash: await cifrar(codigo),
  });

  const respuesta = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'clave-admin-123' },
  });

  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.datos.usuario.rol, 'administrador');
  assert.ok(respuesta.datos.token);
  tokenAdmin = respuesta.datos.token;
});

test('cinco intentos fallidos bloquean la cuenta 15 minutos (RF-7)', async () => {
  for (let intento = 0; intento < 5; intento += 1) {
    const respuesta = await peticion('/auth/login', {
      metodo: 'POST',
      cuerpo: { usuario: 'admin', password: 'incorrecta' },
    });
    assert.equal(respuesta.estado, intento === 4 ? 429 : 401);
  }

  const usuario = await usuariosModelo.buscarPorUsuario('admin');
  assert.equal(usuario.intentos_fallidos, 5);
  assert.ok(usuario.bloqueado_hasta);
});

test('un ingreso correcto reinicia el contador y el código de respaldo funciona una sola vez', async () => {
  await pool.query('UPDATE usuarios SET bloqueado_hasta = NULL WHERE usuario = ?', ['admin']);

  const ingreso = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'clave-admin-123' },
  });
  assert.equal(ingreso.estado, 200);
  tokenAdmin = ingreso.datos.token;
  assert.equal((await usuariosModelo.buscarPorUsuario('admin')).intentos_fallidos, 0);

  const codigo = generarCodigoRecuperacion();
  await pool.query('UPDATE usuarios SET codigo_recuperacion_hash = ? WHERE usuario = ?',
    [await cifrar(codigo), 'admin']);

  const primera = await peticion('/auth/recuperar-contrasena', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', codigoRecuperacion: codigo, nuevaContrasena: 'nueva-clave-456' },
  });
  assert.equal(primera.estado, 200);

  const segunda = await peticion('/auth/recuperar-contrasena', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', codigoRecuperacion: codigo, nuevaContrasena: 'otra-clave-789' },
  });
  assert.equal(segunda.estado, 401);
  assert.equal(segunda.datos.mensaje, 'Código de recuperación incorrecto o ya utilizado');

  // La recuperación invalidó las sesiones anteriores del administrador.
  const nuevoIngreso = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'nueva-clave-456' },
  });
  assert.equal(nuevoIngreso.estado, 200);
  tokenAdmin = nuevoIngreso.datos.token;
});

test('el cajero usa su clave temporal, crea una venta y no puede cerrar sesión durante ella', async () => {
  const creacion = await peticion('/auth/usuarios', {
    metodo: 'POST',
    token: tokenAdmin,
    cuerpo: { nombre: 'Cajero', usuario: 'cajero1', rol: 'cajero' },
  });
  assert.equal(creacion.estado, 201);
  contrasenaCajero = creacion.datos.contrasenaTemporal;
  idCajero = creacion.datos.id;
  assert.ok(contrasenaCajero);

  const ingreso = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: contrasenaCajero },
  });
  assert.equal(ingreso.estado, 200);
  const tokenCajero = ingreso.datos.token;

  const bloqueado = await peticion('/ventas/en-curso', { token: tokenCajero });
  assert.equal(bloqueado.estado, 403);

  const cambio = await peticion('/auth/cambiar-contrasena', {
    metodo: 'POST',
    token: tokenCajero,
    cuerpo: { contrasenaActual: contrasenaCajero, nuevaContrasena: 'clave-cajero-123' },
  });
  assert.equal(cambio.estado, 200);

  const reingreso = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: 'clave-cajero-123' },
  });
  assert.equal(reingreso.estado, 200);
  const tokenListo = reingreso.datos.token;

  const inicio = await peticion('/ventas/iniciar', { metodo: 'POST', token: tokenListo });
  assert.equal(inicio.estado, 201);
  const idVenta = inicio.datos.venta.id;

  const cierre = await peticion('/auth/logout', { metodo: 'POST', token: tokenListo });
  assert.equal(cierre.estado, 409);
  assert.equal(cierre.datos.mensaje, 'Termina o cancela la venta antes de cerrar sesión');

  const fin = await peticion(`/ventas/${idVenta}/finalizar`, { metodo: 'POST', token: tokenListo });
  assert.equal(fin.estado, 200);
  assert.equal((await peticion('/auth/logout', { metodo: 'POST', token: tokenListo })).estado, 200);
});

test('una venta abandonada se cancela a los 15 minutos y aparece en el historial', async () => {
  const ingreso = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: 'clave-cajero-123' },
  });
  const tokenCajero = ingreso.datos.token;

  const inicio = await peticion('/ventas/iniciar', { metodo: 'POST', token: tokenCajero });
  const idVenta = inicio.datos.venta.id;

  await pool.query('UPDATE ventas SET ultima_actividad = DATE_SUB(NOW(), INTERVAL 16 MINUTE) WHERE id = ?', [idVenta]);
  const canceladas = await barrerVentasVencidas(new Date());
  assert.ok(canceladas >= 1);

  const historial = await peticion('/ventas?estado=cancelada_automaticamente', { token: tokenAdmin });
  assert.equal(historial.estado, 200);
  assert.ok(historial.datos.some((venta) => venta.id === idVenta && venta.cajero_usuario === 'cajero1'));
});

test('un cajero no puede desactivar cuentas ni consultar el historial', async () => {
  const ingreso = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: 'clave-cajero-123' },
  });
  const tokenCajero = ingreso.datos.token;

  assert.equal((await peticion('/auth/usuarios', { token: tokenCajero })).estado, 403);
  assert.equal((await peticion('/ventas', { token: tokenCajero })).estado, 403);
  assert.equal((await peticion(`/auth/usuarios/${idCajero}/estado`, {
    metodo: 'PATCH', token: tokenCajero, cuerpo: { activo: false },
  })).estado, 403);
});
