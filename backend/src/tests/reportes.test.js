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

// ---------------------------------------------------------------------------
// Reportes (RF-4 a RF-15): datos con fechas fijas del pasado para que cada período sea exacto
// ---------------------------------------------------------------------------

const { calcularSubtotal, calcularCostoLinea } = await import('../utils/ventas.js');

// Inserta una venta con sus líneas [{ producto, cantidad, precio, costo }] y la fecha indicada.
async function ventaDirecta({
  usuario, cliente = null, fecha, metodo = 'efectivo', estado = 'completada', lineas, anuladaEn = null,
}) {
  const total = lineas.reduce((suma, l) => suma + calcularSubtotal(l.precio, l.cantidad), 0);
  const [venta] = await pool.query(
    `INSERT INTO ventas (usuario_id, cliente_id, fecha, total, metodo_pago, estado, iniciada_en, ultima_actividad,
                         anulada_por, anulada_en, motivo_anulacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuario, cliente, fecha, total, metodo, estado, fecha, fecha,
      anuladaEn ? idAdmin : null, anuladaEn, anuladaEn ? 'Prueba' : null]
  );
  for (const l of lineas) {
    await pool.query(
      `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [venta.insertId, l.producto, l.cantidad, l.precio, l.costo ?? null, calcularSubtotal(l.precio, l.cantidad)]
    );
  }
  return { id: venta.insertId, total };
}

async function nuevoClienteDirecto() {
  contador += 1;
  const [r] = await pool.query('INSERT INTO clientes (rut, nombre) VALUES (?, ?)', [`${50000000 + contador}-0`, `Cliente ${contador}`]);
  return r.insertId;
}

// Abono registrado con la fecha indicada; con anulado: true queda anulado después.
async function abonoDirecto({ cliente, usuario, fecha, monto, metodo, anulado = false }) {
  const [r] = await pool.query(
    "INSERT INTO fiado_transacciones (cliente_id, usuario_id, tipo, monto, metodo_pago, fecha) VALUES (?, ?, 'abono', ?, ?, ?)",
    [cliente, usuario, monto, metodo, fecha]
  );
  if (anulado) {
    await pool.query(
      `INSERT INTO fiado_transacciones (cliente_id, usuario_id, tipo, monto, abono_anulado_id, observacion, fecha)
       VALUES (?, ?, 'anulacion_abono', ?, ?, 'Prueba', ?)`,
      [cliente, idAdmin, monto, r.insertId, fecha]
    );
  }
  return r.insertId;
}

const informe = (ruta, token = tokenAdmin) => peticion(ruta, { token });

test('ventas por período: total, cantidad, promedio y desglose por método, cajero y día suman lo mismo (RF-4, RF-5, RNF-3)', async () => {
  const a = await nuevoCajero();
  const b = await nuevoCajero();
  const p = await nuevoProducto({ precio: 1000, costo: 600, stock: 1000 });
  const linea = (precio, cantidad = 1) => [{ producto: p, cantidad, precio, costo: 600 }];
  const cliente = await nuevoClienteDirecto();

  await ventaDirecta({ usuario: a.id, fecha: '2025-03-10 09:00:00', metodo: 'efectivo', lineas: linea(5000) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-03-10 11:30:00', metodo: 'debito', lineas: linea(3000) });
  await ventaDirecta({ usuario: b.id, fecha: '2025-03-10 15:00:00', metodo: 'credito', lineas: linea(2000) });
  await ventaDirecta({ usuario: b.id, cliente, fecha: '2025-03-10 18:45:00', metodo: 'fiado', lineas: linea(10000) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-03-11 10:00:00', metodo: 'efectivo', lineas: linea(1500) });

  const dia = (await informe('/reportes/ventas?desde=2025-03-10&hasta=2025-03-10')).datos;
  assert.deepEqual([dia.desde, dia.hasta], ['2025-03-10', '2025-03-10']);
  assert.deepEqual([dia.vendido, dia.cantidad, dia.promedio], [20000, 4, 5000]);
  assert.deepEqual(dia.por_metodo, {
    efectivo: { cantidad: 1, total: 5000 }, debito: { cantidad: 1, total: 3000 },
    credito: { cantidad: 1, total: 2000 }, fiado: { cantidad: 1, total: 10000 },
  });
  const porCajero = Object.fromEntries(dia.por_cajero.map((c) => [c.usuario_id, c.total]));
  assert.deepEqual(porCajero, { [a.id]: 8000, [b.id]: 12000 });
  assert.deepEqual(dia.por_dia, [{ dia: '2025-03-10', cantidad: 4, total: 20000 }]);

  // Dos días: el desglose por método, por cajero y por día suma siempre el mismo total
  const dos = (await informe('/reportes/ventas?desde=2025-03-10&hasta=2025-03-11')).datos;
  assert.deepEqual([dos.vendido, dos.cantidad, dos.promedio], [21500, 5, 4300]);
  assert.deepEqual(dos.por_dia.map((d) => [d.dia, d.total]), [['2025-03-10', 20000], ['2025-03-11', 1500]]);
  const suma = (filas) => filas.reduce((s, f) => s + f.total, 0);
  assert.equal(suma(Object.values(dos.por_metodo)), dos.vendido);
  assert.equal(suma(dos.por_cajero), dos.vendido);
  assert.equal(suma(dos.por_dia), dos.vendido);
});

test('las anuladas y canceladas no suman y se informan aparte; una anulada sigue en el día en que se vendió (RF-6, RF-9)', async () => {
  const a = await nuevoCajero();
  const p = await nuevoProducto({ precio: 1000, costo: 600, stock: 1000 });
  const linea = (precio) => [{ producto: p, cantidad: 1, precio, costo: 600 }];

  await ventaDirecta({ usuario: a.id, fecha: '2025-04-01 10:00:00', lineas: linea(7000) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-04-01 12:00:00', estado: 'anulada', anuladaEn: '2025-04-05 09:00:00', lineas: linea(4000) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-04-01 13:00:00', estado: 'cancelada', lineas: linea(900) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-04-01 14:00:00', estado: 'cancelada_automaticamente', lineas: linea(300) });

  const dia1 = (await informe('/reportes/ventas?desde=2025-04-01&hasta=2025-04-01')).datos;
  assert.deepEqual([dia1.vendido, dia1.cantidad], [7000, 1]);
  assert.deepEqual(dia1.anuladas, { cantidad: 1, total: 4000 });
  assert.deepEqual(dia1.canceladas, { cantidad: 2 });

  // El día de la anulación no cuenta la venta anulada: sigue en el día en que se vendió
  const dia5 = (await informe('/reportes/ventas?desde=2025-04-05&hasta=2025-04-05')).datos;
  assert.deepEqual([dia5.vendido, dia5.anuladas.cantidad], [0, 0]);
  // Un período sin ventas queda todo en cero
  const vacio = (await informe('/reportes/ventas?desde=2025-06-20&hasta=2025-06-21')).datos;
  assert.deepEqual([vacio.vendido, vacio.cantidad, vacio.promedio], [0, 0, 0]);
  assert.deepEqual(vacio.por_cajero, []);
  assert.deepEqual(vacio.por_dia, []);
});

test('lo vendido al fiado no es cobrado; los abonos suman por método y un abono anulado no cuenta (RF-7)', async () => {
  const a = await nuevoCajero();
  const cliente = await nuevoClienteDirecto();
  const p = await nuevoProducto({ precio: 1000, costo: 600, stock: 1000 });
  const linea = (precio) => [{ producto: p, cantidad: 1, precio, costo: 600 }];

  await ventaDirecta({ usuario: a.id, fecha: '2025-05-02 09:00:00', metodo: 'efectivo', lineas: linea(5000) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-05-02 10:00:00', metodo: 'debito', lineas: linea(3000) });
  await ventaDirecta({ usuario: a.id, fecha: '2025-05-02 11:00:00', metodo: 'credito', lineas: linea(2000) });
  await ventaDirecta({ usuario: a.id, cliente, fecha: '2025-05-02 12:00:00', metodo: 'fiado', lineas: linea(10000) });
  await abonoDirecto({ cliente, usuario: a.id, fecha: '2025-05-02 16:00:00', monto: 3000, metodo: 'efectivo' });
  await abonoDirecto({ cliente, usuario: a.id, fecha: '2025-05-02 17:00:00', monto: 4000, metodo: 'transferencia' });
  await abonoDirecto({ cliente, usuario: a.id, fecha: '2025-05-02 18:00:00', monto: 2500, metodo: 'efectivo', anulado: true });
  await abonoDirecto({ cliente, usuario: a.id, fecha: '2025-05-03 09:00:00', monto: 1000, metodo: 'debito' });

  const r = (await informe('/reportes/ventas?desde=2025-05-02&hasta=2025-05-02')).datos;
  assert.equal(r.vendido, 20000);
  assert.equal(r.cobrado.vendido_al_fiado, 10000);
  assert.deepEqual(r.cobrado.ventas, { efectivo: 5000, debito: 3000, credito: 2000 });
  assert.deepEqual(r.cobrado.abonos, { efectivo: 3000, debito: 0, credito: 0, transferencia: 4000 });
  assert.deepEqual([r.cobrado.total_ventas, r.cobrado.total_abonos, r.cobrado.total], [10000, 7000, 17000]);

  const dos = (await informe('/reportes/ventas?desde=2025-05-02&hasta=2025-05-03')).datos;
  assert.equal(dos.cobrado.abonos.debito, 1000);
  assert.equal(dos.cobrado.total_abonos, 8000);
});

test('un período inválido responde 400 con el mensaje que dice qué corregir (RF-8)', async () => {
  const invalidos = [
    ['desde=2025-03-11&hasta=2025-03-10', /desde/],
    ['desde=11-03-2025', /AAAA-MM-DD/],
    ['desde=2025-02-31', /AAAA-MM-DD/],
    ['desde=2024-01-01&hasta=2025-06-01', /hasta un año/],
  ];
  for (const ruta of ['ventas', 'ganancias', 'mas-vendidos']) {
    for (const [consulta, patron] of invalidos) {
      const r = await informe(`/reportes/${ruta}?${consulta}`);
      assert.equal(r.estado, 400, `${ruta}?${consulta}`);
      assert.match(r.datos.mensaje, patron);
    }
  }
});

test('sin fechas, el reporte es el de hoy (RF-4, RF-8)', async () => {
  const hoy = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  const esperado = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
  const r = (await informe('/reportes/ventas')).datos;
  assert.deepEqual([r.desde, r.hasta], [esperado, esperado]);
});

test('ganancias: ventas, costo, ganancia y margen, por producto de mayor a menor; las ventas sin costo van aparte (RF-10 a RF-13)', async () => {
  const a = await nuevoCajero();
  const p1 = await nuevoProducto({ nombre: 'Ganancia uno', precio: 1000, costo: 600, stock: 1000 });
  const p2 = await nuevoProducto({ nombre: 'Ganancia dos kilo', precio: 1590, costo: 900, unidad: 'kilo', stock: 1000 });
  const p3 = await nuevoProducto({ nombre: 'Ganancia tres', precio: 500, costo: 0, stock: 1000 });

  await ventaDirecta({ usuario: a.id, fecha: '2025-06-10 09:00:00', lineas: [{ producto: p1, cantidad: 3, precio: 1000, costo: 600 }] });
  await ventaDirecta({ usuario: a.id, fecha: '2025-06-10 10:00:00', lineas: [{ producto: p2, cantidad: 1.35, precio: 1590, costo: 900 }] });
  await ventaDirecta({ usuario: a.id, fecha: '2025-06-10 11:00:00', lineas: [{ producto: p3, cantidad: 2, precio: 500, costo: 0 }] });
  // Anterior a este módulo: sin costo. Una anulada y una cancelada con costo: no cuentan
  await ventaDirecta({ usuario: a.id, fecha: '2025-06-10 12:00:00', lineas: [{ producto: p1, cantidad: 4, precio: 1000, costo: null }] });
  await ventaDirecta({ usuario: a.id, fecha: '2025-06-10 13:00:00', estado: 'anulada', anuladaEn: '2025-06-11 09:00:00', lineas: [{ producto: p1, cantidad: 9, precio: 1000, costo: 600 }] });
  await ventaDirecta({ usuario: a.id, fecha: '2025-06-10 14:00:00', estado: 'cancelada', lineas: [{ producto: p1, cantidad: 9, precio: 1000, costo: 600 }] });

  const r = (await informe('/reportes/ganancias?desde=2025-06-10&hasta=2025-06-10')).datos;
  const costoTomate = calcularCostoLinea(900, 1.35); // 1.215
  assert.equal(costoTomate, 1215);
  assert.equal(r.vendido, 3000 + calcularSubtotal(1590, 1.35) + 1000); // 6.147
  assert.equal(r.costo, 1800 + costoTomate + 0); // 3.015
  assert.deepEqual([r.ganancia, r.margen], [3132, 51]);

  assert.deepEqual(r.productos.map((x) => [x.nombre, x.ganancia]), [
    ['Ganancia uno', 1200], ['Ganancia tres', 1000], ['Ganancia dos kilo', 932],
  ]);
  assert.deepEqual(r.productos.map((x) => x.margen), [40, 100, 43]);
  assert.deepEqual(r.productos.map((x) => x.costo_cero), [false, true, false]);
  assert.equal(r.productos_con_costo_cero, 1);
  assert.equal(r.total_productos, 3);
  assert.equal(r.productos[2].cantidad, 1.35);

  // Las ventas sin costo se informan aparte y no entran a la ganancia
  assert.deepEqual(r.sin_costo, { cantidad: 1, total: 4000 });
  const sumaProductos = r.productos.reduce((s, x) => s + x.vendido, 0);
  assert.equal(sumaProductos, r.vendido, 'el detalle por producto suma lo vendido con costo');
});

test('ganancias en un período sin ventas queda en cero (RF-10)', async () => {
  const r = (await informe('/reportes/ganancias?desde=2025-07-01&hasta=2025-07-02')).datos;
  assert.deepEqual([r.vendido, r.costo, r.ganancia, r.margen], [0, 0, 0, 0]);
  assert.deepEqual(r.productos, []);
  assert.deepEqual(r.sin_costo, { cantidad: 0, total: 0 });
});

test('los más vendidos van por monto, con su unidad, incluidos los productos desactivados (RF-14)', async () => {
  const a = await nuevoCajero();
  const grande = await nuevoProducto({ nombre: 'Vendido grande', precio: 3000, costo: 1000, stock: 1000 });
  const kilo = await nuevoProducto({ nombre: 'Vendido kilo', precio: 2000, costo: 1000, unidad: 'kilo', stock: 1000 });
  const chico = await nuevoProducto({ nombre: 'Vendido chico', precio: 100, costo: 50, stock: 1000 });
  const desactivado = await nuevoProducto({ nombre: 'Vendido y desactivado', precio: 4000, costo: 1000, stock: 1000 });

  await ventaDirecta({ usuario: a.id, fecha: '2025-08-10 09:00:00', lineas: [
    { producto: grande, cantidad: 3, precio: 3000, costo: 1000 },
    { producto: kilo, cantidad: 2.5, precio: 2000, costo: 1000 },
    { producto: chico, cantidad: 50, precio: 100, costo: 50 }] });
  await ventaDirecta({ usuario: a.id, fecha: '2025-08-10 10:00:00', lineas: [{ producto: desactivado, cantidad: 1, precio: 4000, costo: 1000 }] });
  await ventaDirecta({ usuario: a.id, fecha: '2025-08-10 11:00:00', estado: 'anulada', anuladaEn: '2025-08-10 12:00:00', lineas: [{ producto: chico, cantidad: 999, precio: 100, costo: 50 }] });
  await pool.query('UPDATE productos SET activo = 0 WHERE id = ?', [desactivado]);

  const r = (await informe('/reportes/mas-vendidos?desde=2025-08-10&hasta=2025-08-10')).datos;
  assert.equal(r.limite, 10);
  // Por monto; con el mismo monto, por nombre (chico: 50 × $100 = $5.000, kilo: 2,5 × $2.000 = $5.000)
  assert.deepEqual(r.productos.map((x) => [x.nombre, x.monto]), [
    ['Vendido grande', 9000], ['Vendido chico', 5000], ['Vendido kilo', 5000], ['Vendido y desactivado', 4000],
  ]);
  const kiloFila = r.productos.find((x) => x.nombre === 'Vendido kilo');
  assert.deepEqual([kiloFila.unidad_medida, kiloFila.cantidad], ['kilo', 2.5]);
  assert.equal(r.productos.find((x) => x.nombre === 'Vendido y desactivado').activo, false);
  assert.equal(r.productos.find((x) => x.nombre === 'Vendido chico').cantidad, 50, 'la anulada no suma');

  const dos = (await informe('/reportes/mas-vendidos?desde=2025-08-10&hasta=2025-08-10&limite=2')).datos;
  assert.equal(dos.productos.length, 2);
  assert.equal(dos.productos[0].nombre, 'Vendido grande');
  for (const limite of ['0', '51', 'abc', '-1', '2.5']) {
    const invalido = await informe(`/reportes/mas-vendidos?limite=${limite}`);
    assert.equal(invalido.estado, 400, `límite ${limite}`);
    assert.match(invalido.datos.mensaje, /entre 1 y 50/);
  }
});

test('por reponer: primero los agotados y luego los de stock bajo, sin los desactivados ni los normales (RF-15)', async () => {
  await nuevoProducto({ nombre: 'Reponer normal', stock: 50, minimo: 5 });
  await nuevoProducto({ nombre: 'Reponer bajo B', stock: 3, minimo: 5 });
  await nuevoProducto({ nombre: 'Reponer bajo A', stock: 1, minimo: 5 });
  await nuevoProducto({ nombre: 'Reponer agotado', stock: 0, minimo: 5 });
  await nuevoProducto({ nombre: 'Reponer desactivado agotado', stock: 0, minimo: 5, activo: 0 });
  await nuevoProducto({ nombre: 'Reponer sin mínimo', stock: 2, minimo: 0 });

  const r = (await informe('/reportes/por-reponer')).datos;
  const propios = r.productos.filter((x) => x.nombre.startsWith('Reponer'));
  assert.deepEqual(propios.map((x) => [x.nombre, x.estado]), [
    ['Reponer agotado', 'agotado'], ['Reponer bajo A', 'bajo'], ['Reponer bajo B', 'bajo'],
  ]);
  assert.ok(r.productos.every((x) => x.activo), 'solo productos activos');
  assert.equal(r.resumen.agotados, r.productos.filter((x) => x.estado === 'agotado').length);
  assert.equal(r.resumen.stock_bajo, r.productos.filter((x) => x.estado === 'bajo').length);
  assert.equal(/costo|margen/i.test(JSON.stringify(r)), false, 'el reporte de reposición no lleva costos');
});

test('los reportes son solo del administrador: el cajero recibe 403 y sin sesión 401, también por acceso directo (RF-28)', async () => {
  const cajero = await nuevoCajero();
  for (const ruta of ['ventas', 'ganancias', 'mas-vendidos', 'por-reponer']) {
    assert.equal((await informe(`/reportes/${ruta}`, cajero.token)).estado, 403, ruta);
    assert.equal((await informe(`/reportes/${ruta}`, null)).estado, 401, ruta);
  }
  // El endpoint provisorio del módulo ya no existe: no queda ningún 501
  assert.equal((await informe('/reportes/ventas-hoy')).estado, 404);
});
