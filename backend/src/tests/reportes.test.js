// Pruebas de integración de la spec 005 (reportes y cierre de caja) contra MySQL.
// Se ejecutan aparte: npm run test:integracion
// Usan su propia base (almacenpro_test_reportes) para no chocar con las otras suites, que node --test
// ejecuta en paralelo, ni tocar la base real.
process.env.DB_NAME = process.env.DB_NAME ?? 'almacenpro_test_reportes';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-pruebas-spec005';

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
const ventasModelo = await import('../models/ventas.model.js');
const { emitirToken } = await import('../services/credenciales.js');

const directorio = path.dirname(fileURLToPath(import.meta.url));
const rutaEsquema = path.resolve(directorio, '../../database/schema.sql');

let servidor;
let tokenAdmin;
let idAdmin;
let contador = 0;

function url(ruta) {
  return `http://127.0.0.1:${servidor.address().port}/api${ruta}`;
}

async function peticion(ruta, { metodo = 'GET', token = tokenAdmin, cuerpo } = {}) {
  const respuesta = await fetch(url(ruta), {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = { mensaje: texto }; }
  return { estado: respuesta.status, datos };
}

// Cada prueba usa su propio cajero: solo se permite una venta en curso por persona.
async function nuevoCajero() {
  contador += 1;
  const id = await usuariosModelo.crear({
    nombre: `Cajero ${contador}`, usuario: `cajero${contador}`, passwordHash: 'no-se-usa', rol: 'cajero',
  });
  return { id, token: emitirToken(await usuariosModelo.buscarPorId(id)) };
}

async function nuevoProducto({
  nombre, precio = 1000, costo = 600, stock = 50, unidad = 'unidad', activo = 1, minimo = 0,
} = {}) {
  contador += 1;
  const [resultado] = await pool.query(
    `INSERT INTO productos
       (nombre, precio_venta, precio_costo, stock, stock_minimo, unidad_medida, activo, categoria_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [nombre ?? `Producto ${contador}`, precio, costo, stock, minimo, unidad, activo]
  );
  return resultado.insertId;
}

async function iniciar(token) {
  const respuesta = await peticion('/ventas/iniciar', { metodo: 'POST', token });
  assert.equal(respuesta.estado, 201, JSON.stringify(respuesta.datos));
  return respuesta.datos.venta.id;
}

async function agregar(token, ventaId, productoId, cantidad) {
  return peticion(`/ventas/${ventaId}/lineas`, {
    metodo: 'POST', token, cuerpo: { producto_id: productoId, cantidad },
  });
}

// Inicia una venta y le agrega las líneas [productoId, cantidad].
async function armarVenta(token, lineas) {
  const ventaId = await iniciar(token);
  for (const [productoId, cantidad] of lineas) {
    const respuesta = await agregar(token, ventaId, productoId, cantidad);
    assert.equal(respuesta.estado, 200, JSON.stringify(respuesta.datos));
  }
  return ventaId;
}

function confirmar(token, ventaId, cuerpo = { metodo_pago: 'debito' }) {
  return peticion(`/ventas/${ventaId}/confirmar`, { metodo: 'POST', token, cuerpo });
}

// El administrador cambia el costo de un producto por la API, como lo haría desde Inventario.
async function cambiarCosto(productoId, costo) {
  const [[producto]] = await pool.query(
    'SELECT nombre, categoria_id, precio_venta, stock_minimo, unidad_medida FROM productos WHERE id = ?', [productoId]
  );
  const r = await peticion(`/productos/${productoId}`, {
    metodo: 'PUT',
    cuerpo: {
      nombre: producto.nombre,
      categoria_id: producto.categoria_id,
      precio_venta: Number(producto.precio_venta),
      precio_costo: costo,
      stock_minimo: Number(producto.stock_minimo),
      unidad_medida: producto.unidad_medida,
    },
  });
  assert.equal(r.estado, 200, JSON.stringify(r.datos));
}

async function costosDe(ventaId) {
  const [filas] = await pool.query(
    'SELECT producto_id, costo_unitario FROM detalle_ventas WHERE venta_id = ? ORDER BY producto_id',
    [ventaId]
  );
  return filas.map((fila) => (fila.costo_unitario === null ? null : Number(fila.costo_unitario)));
}

before(async () => {
  const nombreBase = env.db.nombre;
  // Nunca se debe borrar una base que no sea de pruebas.
  assert.match(nombreBase, /test/, `La base "${nombreBase}" no parece de pruebas`);

  const conexion = await mysql.createConnection({
    host: env.db.host,
    port: env.db.puerto,
    user: env.db.usuario,
    password: env.db.contrasena,
    multipleStatements: true,
  });
  // schema.sql crea "almacenpro": se redirige a la base de pruebas.
  const sql = fs.readFileSync(rutaEsquema, 'utf8').replaceAll('almacenpro', nombreBase);
  await conexion.query(`DROP DATABASE IF EXISTS ${nombreBase}`);
  await conexion.query(sql);
  await conexion.end();

  idAdmin = await usuariosModelo.crear({
    nombre: 'Dueño', usuario: 'admin', passwordHash: 'no-se-usa', rol: 'administrador',
  });
  tokenAdmin = emitirToken(await usuariosModelo.buscarPorId(idAdmin));

  servidor = app.listen(0);
});

after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  await pool.end();
});

// ---------------------------------------------------------------------------
// Costo congelado de las ventas (RF-1, RF-2, RF-3)
// ---------------------------------------------------------------------------

test('al confirmar la venta cada línea guarda el costo del producto en ese momento (RF-1)', async () => {
  const cajero = await nuevoCajero();
  const pan = await nuevoProducto({ precio: 1000, costo: 600 });
  const tomate = await nuevoProducto({ precio: 1590, costo: 900, unidad: 'kilo', stock: 20 });
  const ventaId = await armarVenta(cajero.token, [[pan, 2], [tomate, 1.35]]);

  // Antes de confirmar el carrito no tiene costo
  assert.deepEqual(await costosDe(ventaId), [null, null]);

  const r = await confirmar(cajero.token, ventaId);
  assert.equal(r.estado, 200, JSON.stringify(r.datos));
  assert.deepEqual(await costosDe(ventaId), [600, 900]);
});

test('cambiar el costo de un producto después de la venta no cambia el costo ya vendido (RF-1)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 2000, costo: 1200, stock: 30 });
  const primera = await armarVenta(cajero.token, [[producto, 1]]);
  assert.equal((await confirmar(cajero.token, primera)).estado, 200);

  await cambiarCosto(producto, 1500);
  const [[producto2]] = await pool.query('SELECT precio_costo FROM productos WHERE id = ?', [producto]);
  assert.equal(Number(producto2.precio_costo), 1500);

  assert.deepEqual(await costosDe(primera), [1200], 'la venta ya hecha conserva su costo');
  const segunda = await armarVenta(cajero.token, [[producto, 1]]);
  assert.equal((await confirmar(cajero.token, segunda)).estado, 200);
  assert.deepEqual(await costosDe(segunda), [1500], 'la venta nueva toma el costo nuevo');
});

test('una venta anulada conserva el costo congelado y una cancelada no tiene costo (RF-1, RF-2)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000, costo: 700, stock: 30 });

  const completada = await armarVenta(cajero.token, [[producto, 2]]);
  assert.equal((await confirmar(cajero.token, completada)).estado, 200);
  const anulacion = await peticion(`/ventas/${completada}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Prueba de costo' } });
  assert.equal(anulacion.estado, 200, JSON.stringify(anulacion.datos));
  assert.deepEqual(await costosDe(completada), [700]);

  const cancelada = await armarVenta(cajero.token, [[producto, 1]]);
  assert.equal((await peticion(`/ventas/${cancelada}/cancelar`, { metodo: 'POST', token: cajero.token })).estado, 200);
  assert.deepEqual(await costosDe(cancelada), [null], 'lo que no se vendió no tiene costo');
});

test('las ventas anteriores a este módulo quedan sin costo y nada se lo inventa (RF-2)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000, costo: 600, stock: 30 });
  // Una venta ya confirmada antes de la spec 005: su línea no tiene costo
  const [venta] = await pool.query(
    "INSERT INTO ventas (usuario_id, total, metodo_pago, estado) VALUES (?, 1000, 'efectivo', 'completada')", [cajero.id]
  );
  await pool.query(
    'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, 1, 1000, 1000)',
    [venta.insertId, producto]
  );

  await cambiarCosto(producto, 650);
  assert.deepEqual(await costosDe(venta.insertId), [null]);
  const detalle = await peticion(`/ventas/${venta.insertId}`);
  assert.equal(detalle.estado, 200);
  assert.equal(detalle.datos.lineas.length, 1);
});

test('si la confirmación se rechaza o falla, no queda ningún costo guardado (RF-1, RNF-4)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000, costo: 600, stock: 5 });

  // Rechazada: el stock bajó después de armar el carrito
  const rechazada = await armarVenta(cajero.token, [[producto, 4]]);
  await pool.query('UPDATE productos SET stock = 2 WHERE id = ?', [producto]);
  const r = await confirmar(cajero.token, rechazada);
  assert.equal(r.estado, 409);
  assert.deepEqual(await costosDe(rechazada), [null]);
  await peticion(`/ventas/${rechazada}/cancelar`, { metodo: 'POST', token: cajero.token });

  // Falla a mitad de la transacción: una cuenta inexistente rompe el movimiento de stock, que se
  // inserta después de guardar el costo. Se revierte todo, incluido el costo.
  await pool.query('UPDATE productos SET stock = 10 WHERE id = ?', [producto]);
  const otro = await nuevoCajero();
  const fallida = await armarVenta(otro.token, [[producto, 3]]);
  await assert.rejects(ventasModelo.confirmar({
    ventaId: fallida, usuarioId: 999999, metodoPago: 'debito', hoy: new Date(),
  }));
  assert.deepEqual(await costosDe(fallida), [null]);
  const [[estado]] = await pool.query('SELECT estado FROM ventas WHERE id = ?', [fallida]);
  assert.equal(estado.estado, 'en_curso');
  const [[stock]] = await pool.query('SELECT stock FROM productos WHERE id = ?', [producto]);
  assert.equal(Number(stock.stock), 10);

  // Con una cuenta válida la misma venta se confirma y ahora sí guarda el costo
  assert.equal((await confirmar(otro.token, fallida)).estado, 200);
  assert.deepEqual(await costosDe(fallida), [600]);
});

test('el costo no viaja en ninguna respuesta de la venta para el cajero (RF-3, RNF-8)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ nombre: 'Producto de la prueba de privacidad', precio: 1000, costo: 777, stock: 30 });

  const ventaId = await iniciar(cajero.token);
  const agregado = await agregar(cajero.token, ventaId, producto, 2);
  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  const vendibles = await peticion('/productos/vendibles?buscar=privacidad', { token: cajero.token });
  const confirmado = await confirmar(cajero.token, ventaId);
  assert.equal(confirmado.estado, 200);

  for (const [nombre, respuesta] of [['agregar', agregado], ['en-curso', enCurso], ['vendibles', vendibles], ['confirmar', confirmado]]) {
    const texto = JSON.stringify(respuesta.datos);
    assert.equal(texto.includes('777'), false, `${nombre}: el valor del costo no viaja`);
    assert.equal(/costo|margen/i.test(texto), false, `${nombre}: no hay campos de costo`);
  }
  // El cajero tampoco llega al detalle de ventas, donde el administrador sí ve las líneas
  assert.equal((await peticion(`/ventas/${ventaId}`, { token: cajero.token })).estado, 403);
});
