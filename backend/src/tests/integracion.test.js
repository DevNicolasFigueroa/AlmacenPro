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
let idAdmin2;
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

test('el último Administrador activo no puede desactivarse ni restablecerse (RF-26, RF-27)', async () => {
  const admin = await usuariosModelo.buscarPorUsuario('admin');

  const loginAdmin = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'nueva-clave-456' },
  });
  assert.equal(loginAdmin.estado, 200);

  // Desactivar al último Administrador activo se rechaza.
  const desactivarUltimo = await peticion(`/auth/usuarios/${admin.id}/estado`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
    cuerpo: { activo: false },
  });
  assert.equal(desactivarUltimo.estado, 409);
  assert.equal(
    desactivarUltimo.datos.mensaje,
    'Debe quedar al menos un Administrador activo'
  );

  // Restablecer la contraseña de un único Administrador activo se rechaza:
  // con esa cuenta la acción se hace con "cambiar tu propia contraseña".
  const restablelerUltimo = await peticion(`/auth/usuarios/${admin.id}/contrasena`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
  });
  assert.equal(restablelerUltimo.estado, 400);
  assert.equal(restablelerUltimo.datos.mensaje, 'Usa la opción de cambiar tu propia contraseña');

  // Cuando hay otro Administrador activo, desactivarlo y reactivarlo es posible.
  const crearAdmin2 = await peticion('/auth/usuarios', {
    metodo: 'POST',
    token: loginAdmin.datos.token,
    cuerpo: { nombre: 'Segundo', usuario: 'admin2', rol: 'administrador', password: 'admin2-1234' },
  });
  assert.equal(crearAdmin2.estado, 201);
  idAdmin2 = crearAdmin2.datos.id;

  const desactivarAdmin2 = await peticion(`/auth/usuarios/${idAdmin2}/estado`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
    cuerpo: { activo: false },
  });
  assert.equal(desactivarAdmin2.estado, 200);

  const reactivarAdmin2 = await peticion(`/auth/usuarios/${idAdmin2}/estado`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
    cuerpo: { activo: true },
  });
  assert.equal(reactivarAdmin2.estado, 200);
});

test('el Administrador desactiva un cajero, puede reactivarlo y se reingresa', async () => {
  const loginAdmin = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'nueva-clave-456' },
  });
  assert.equal(loginAdmin.estado, 200);
  const tokenAdmin = loginAdmin.datos.token;

  const loginCajero = async () => peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: 'clave-cajero-123' },
  });

  assert.equal((await loginCajero()).estado, 200);

  const desactivar = await peticion(`/auth/usuarios/${idCajero}/estado`, {
    metodo: 'PATCH',
    token: tokenAdmin,
    cuerpo: { activo: false },
  });
  assert.equal(desactivar.estado, 200);

  const ingresoDesactivado = await loginCajero();
  assert.equal(ingresoDesactivado.estado, 403);
  assert.equal(
    ingresoDesactivado.datos.mensaje,
    'Esta cuenta está desactivada. Consulta con el administrador'
  );

  const reactivar = await peticion(`/auth/usuarios/${idCajero}/estado`, {
    metodo: 'PATCH',
    token: tokenAdmin,
    cuerpo: { activo: true },
  });
  assert.equal(reactivar.estado, 200);

  assert.equal((await loginCajero()).estado, 200);
});

test('un cajero desactivado con venta en curso solo puede cerrarla y pierde el acceso', async () => {
  const loginAdmin = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'nueva-clave-456' },
  });
  assert.equal(loginAdmin.estado, 200);

  const loginCajero = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: 'clave-cajero-123' },
  });
  assert.equal(loginCajero.estado, 200);
  const tokenCajero = loginCajero.datos.token;

  const inicio = await peticion('/ventas/iniciar', { metodo: 'POST', token: tokenCajero });
  assert.equal(inicio.estado, 201);
  const idVenta = inicio.datos.venta.id;

  const desactivar = await peticion(`/auth/usuarios/${idCajero}/estado`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
    cuerpo: { activo: false },
  });
  assert.equal(desactivar.estado, 200);
  assert.ok(desactivar.datos.mensaje.includes('podrá terminar o cancelar la venta'));

  // Solo las acciones para terminar la venta siguen permitidas (spec 003): no puede iniciar
  // otra venta ni usar rutas ajenas al cobro.
  const otraVenta = await peticion('/ventas/iniciar', { metodo: 'POST', token: tokenCajero });
  assert.equal(otraVenta.estado, 403);
  const inventario = await peticion('/productos', { token: tokenCajero });
  assert.equal(inventario.estado, 403);

  const fin = await peticion(`/ventas/${idVenta}/finalizar`, { metodo: 'POST', token: tokenCajero });
  assert.equal(fin.estado, 200);

  // Al terminar la venta, la sesión se invalida al momento.
  const salida = await peticion('/auth/logout', { metodo: 'POST', token: tokenCajero });
  assert.equal(salida.estado, 401);

  const reactivar = await peticion(`/auth/usuarios/${idCajero}/estado`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
    cuerpo: { activo: true },
  });
  assert.equal(reactivar.estado, 200);
});

test('cancelar una venta a un cajero desactivado invalida su acceso', async () => {
  const loginAdmin = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'nueva-clave-456' },
  });
  assert.equal(loginAdmin.estado, 200);

  const loginCajero = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', password: 'clave-cajero-123' },
  });
  assert.equal(loginCajero.estado, 200);
  const tokenCajero = loginCajero.datos.token;

  const inicio = await peticion('/ventas/iniciar', { metodo: 'POST', token: tokenCajero });
  assert.equal(inicio.estado, 201);
  const idVenta = inicio.datos.venta.id;

  const desactivar = await peticion(`/auth/usuarios/${idCajero}/estado`, {
    metodo: 'PATCH',
    token: loginAdmin.datos.token,
    cuerpo: { activo: false },
  });
  assert.equal(desactivar.estado, 200);

  const cancelar = await peticion(`/ventas/${idVenta}/cancelar`, { metodo: 'POST', token: tokenCajero });
  assert.equal(cancelar.estado, 200);

  // Aparece sesión invalidada: el token queda caducado.
  const nuevaVenta = await peticion('/ventas/iniciar', { metodo: 'POST', token: tokenCajero });
  assert.equal(nuevaVenta.estado, 401);
});

test('crear cuentas duplicadas y contraseñas iguales al usuario se rechazan', async () => {
  const loginAdmin = await peticion('/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: 'admin', password: 'nueva-clave-456' },
  });
  assert.equal(loginAdmin.estado, 200);

  const duplicado = await peticion('/auth/usuarios', {
    metodo: 'POST',
    token: loginAdmin.datos.token,
    cuerpo: { nombre: 'Dup', usuario: 'admin', rol: 'cajero' },
  });
  assert.equal(duplicado.estado, 409);

  const igualUsuario = await peticion('/auth/usuarios', {
    metodo: 'POST',
    token: loginAdmin.datos.token,
    cuerpo: { nombre: 'CajeroX', usuario: 'cajero2x', rol: 'administrador', password: 'cajero2x' },
  });
  assert.equal(igualUsuario.estado, 400);

  const recuperar = await peticion('/auth/recuperar-contrasena', {
    metodo: 'POST',
    cuerpo: { usuario: 'cajero1', codigoRecuperacion: 'x', nuevaContrasena: 'cajero2x' },
  });
  assert.equal(recuperar.estado, 401);
});
