// Pruebas de integración de la spec 003 (ventas) contra MySQL.
// Se ejecutan aparte: npm run test:integracion
// Usan su propia base (almacenpro_test_ventas) para no chocar con las pruebas de las specs 001
// y 002, que node --test ejecuta en paralelo, ni tocar la base real.
process.env.DB_NAME = process.env.DB_NAME ?? 'almacenpro_test_ventas';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-pruebas-spec003';

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
const { barrerVentasVencidas } = await import('../services/ventasVencidas.js');

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
  nombre, precio = 1000, costo = 600, stock = 10, unidad = 'unidad', activo = 1, minimo = 0,
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

async function stockDe(id) {
  const [[fila]] = await pool.query('SELECT stock FROM productos WHERE id = ?', [id]);
  return Number(fila.stock);
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

async function registrarCliente(rut, nombre) {
  const respuesta = await peticion('/clientes', { metodo: 'POST', cuerpo: { rut, nombre } });
  assert.equal(respuesta.estado, 201, JSON.stringify(respuesta.datos));
  return respuesta.datos.cliente;
}

async function saldoDe(clienteId) {
  const [[fila]] = await pool.query('SELECT saldo_fiado FROM v_saldo_fiado WHERE cliente_id = ?', [clienteId]);
  return Number(fila.saldo_fiado);
}

async function resumenDelDia() {
  return (await peticion('/ventas')).datos.resumen;
}

// Genera un RUT válido con dígito verificador a partir de un cuerpo de 8 dígitos.
function rutValido(cuerpo) {
  let suma = 0;
  let peso = 2;
  for (const digito of String(cuerpo).split('').reverse()) {
    suma += Number(digito) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return `${cuerpo}-${dv}`;
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
// Armar la venta
// ---------------------------------------------------------------------------

test('se arma una venta con productos por unidad y por kilo y el total suma las líneas redondeadas (RF-3, RF-11, RF-12)', async () => {
  const cajero = await nuevoCajero();
  const pan = await nuevoProducto({ precio: 1000 });
  const tomate = await nuevoProducto({ precio: 1590, unidad: 'kilo', stock: 5.5 });
  const ventaId = await iniciar(cajero.token);

  await agregar(cajero.token, ventaId, pan, 2);
  const respuesta = await agregar(cajero.token, ventaId, tomate, 0.35);
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.datos.total, 2557); // 2.000 + 556,5 redondeado a 557
  assert.deepEqual(respuesta.datos.lineas.map((l) => l.subtotal), [2000, 557]);

  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  assert.equal(enCurso.datos.total, 2557);
  assert.equal(enCurso.datos.lineas.length, 2);
  assert.equal(enCurso.datos.ventaActiva.total, 2557);
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
});

test('el precio queda congelado al agregar aunque el administrador lo cambie (RF-3, RF-5)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000 });
  const ventaId = await armarVenta(cajero.token, [[producto, 2]]);

  await pool.query('UPDATE productos SET precio_venta = 1500 WHERE id = ?', [producto]);

  // Agregar el mismo producto suma en la misma línea y conserva el precio con que se agregó.
  const respuesta = await agregar(cajero.token, ventaId, producto, 1);
  assert.equal(respuesta.datos.lineas.length, 1);
  assert.equal(respuesta.datos.lineas[0].cantidad, 3);
  assert.equal(respuesta.datos.lineas[0].precio_unitario, 1000);
  assert.equal(respuesta.datos.total, 3000);

  const confirmada = await confirmar(cajero.token, ventaId);
  assert.equal(confirmada.estado, 200);
  const [[detalle]] = await pool.query('SELECT precio_unitario FROM detalle_ventas WHERE venta_id = ?', [ventaId]);
  assert.equal(Number(detalle.precio_unitario), 1000);
});

test('se rechaza lo que supera el stock, lo desactivado, lo agotado y las cantidades inválidas (RF-4, RF-7, RF-8, RF-13)', async () => {
  const cajero = await nuevoCajero();
  const poco = await nuevoProducto({ stock: 2 });
  const desactivado = await nuevoProducto({ activo: 0 });
  const agotado = await nuevoProducto({ stock: 0 });
  const barato = await nuevoProducto({ precio: 100, unidad: 'kilo', stock: 5 });
  const ventaId = await iniciar(cajero.token);

  let r = await agregar(cajero.token, ventaId, poco, 3);
  assert.equal(r.estado, 409);
  assert.equal(r.datos.codigo, 'STOCK_INSUFICIENTE');
  assert.equal(r.datos.stockDisponible, 2);
  assert.match(r.datos.mensaje, /Solo quedan 2 u\./);

  assert.equal((await agregar(cajero.token, ventaId, desactivado, 1)).datos.codigo, 'PRODUCTO_DESACTIVADO');
  assert.equal((await agregar(cajero.token, ventaId, agotado, 1)).datos.codigo, 'AGOTADO');
  assert.equal((await agregar(cajero.token, ventaId, poco, 1.5)).estado, 400); // unidades enteras
  assert.equal((await agregar(cajero.token, ventaId, poco, 0)).estado, 400);
  assert.equal((await agregar(cajero.token, ventaId, poco, -1)).estado, 400);
  r = await agregar(cajero.token, ventaId, barato, 0.001); // 100 * 0,001 = $0,1 -> $0
  assert.equal(r.datos.codigo, 'SUBTOTAL_CERO');
  assert.equal((await agregar(cajero.token, ventaId, 999999, 1)).estado, 404);

  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  assert.equal(enCurso.datos.lineas.length, 0);

  // Sin cantidad se agrega 1 (RF-3)
  r = await peticion(`/ventas/${ventaId}/lineas`, { metodo: 'POST', token: cajero.token, cuerpo: { producto_id: poco } });
  assert.equal(r.datos.lineas[0].cantidad, 1);
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
});

test('cambiar, quitar y vaciar el carrito actualizan el total (RF-6)', async () => {
  const cajero = await nuevoCajero();
  const a = await nuevoProducto({ precio: 1000, stock: 5 });
  const b = await nuevoProducto({ precio: 500, stock: 5 });
  const ventaId = await armarVenta(cajero.token, [[a, 2], [b, 1]]);

  let r = await peticion(`/ventas/${ventaId}/lineas/${a}`, { metodo: 'PATCH', token: cajero.token, cuerpo: { cantidad: 4 } });
  assert.equal(r.datos.total, 4500);
  r = await peticion(`/ventas/${ventaId}/lineas/${a}`, { metodo: 'PATCH', token: cajero.token, cuerpo: { cantidad: 6 } });
  assert.equal(r.datos.codigo, 'STOCK_INSUFICIENTE');
  r = await peticion(`/ventas/${ventaId}/lineas/${b}`, { metodo: 'DELETE', token: cajero.token });
  assert.equal(r.datos.total, 4000);
  r = await peticion(`/ventas/${ventaId}/lineas`, { metodo: 'DELETE', token: cajero.token });
  assert.deepEqual([r.datos.lineas.length, r.datos.total], [0, 0]);
  assert.equal((await peticion(`/ventas/${ventaId}/lineas/${b}`, { metodo: 'DELETE', token: cajero.token })).estado, 404);
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
});

test('cada cambio del carrito cuenta como actividad de la venta (RF-9)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto();
  const ventaId = await iniciar(cajero.token);
  await pool.query('UPDATE ventas SET ultima_actividad = DATE_SUB(NOW(), INTERVAL 12 MINUTE) WHERE id = ?', [ventaId]);

  await agregar(cajero.token, ventaId, producto, 1);
  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  assert.equal(enCurso.datos.aviso, false); // la actividad reinició el reloj
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
});

test('otro cajero no puede tocar el carrito, el administrador sí (spec 001, RF-14)', async () => {
  const dueno = await nuevoCajero();
  const intruso = await nuevoCajero();
  const producto = await nuevoProducto();
  const ventaId = await armarVenta(dueno.token, [[producto, 1]]);

  assert.equal((await agregar(intruso.token, ventaId, producto, 1)).estado, 403);
  assert.equal((await confirmar(intruso.token, ventaId)).estado, 403);
  const r = await peticion(`/ventas/${ventaId}/lineas/${producto}`, { metodo: 'DELETE', token: tokenAdmin });
  assert.equal(r.estado, 200);
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: dueno.token });
});

test('al cancelar, a mano o por inactividad, la venta queda con su carrito y sin tocar stock ni deuda (RF-10)', async () => {
  const manual = await nuevoCajero();
  const abandonada = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 10 });

  const idManual = await armarVenta(manual.token, [[producto, 3]]);
  assert.equal((await peticion(`/ventas/${idManual}/cancelar`, { metodo: 'POST', token: manual.token })).estado, 200);

  const idAbandonada = await armarVenta(abandonada.token, [[producto, 2]]);
  await pool.query('UPDATE ventas SET ultima_actividad = DATE_SUB(NOW(), INTERVAL 16 MINUTE) WHERE id = ?', [idAbandonada]);
  assert.ok(await barrerVentasVencidas(new Date()) >= 1);

  const [[a]] = await pool.query('SELECT estado, cancelada_en, fecha FROM ventas WHERE id = ?', [idManual]);
  const [[b]] = await pool.query('SELECT estado FROM ventas WHERE id = ?', [idAbandonada]);
  assert.equal(a.estado, 'cancelada');
  assert.ok(a.cancelada_en);
  assert.equal(b.estado, 'cancelada_automaticamente');
  assert.equal(await stockDe(producto), 10);
  const [[lineas]] = await pool.query('SELECT COUNT(*) AS n FROM detalle_ventas WHERE venta_id IN (?, ?)', [idManual, idAbandonada]);
  assert.equal(lineas.n, 2);
  const [[movimientos]] = await pool.query("SELECT COUNT(*) AS n FROM movimientos_stock WHERE tipo = 'venta' AND producto_id = ?", [producto]);
  assert.equal(movimientos.n, 0);

  // El detalle muestra el carrito de las canceladas (RF-39)
  const detalle = await peticion(`/ventas/${idManual}`);
  assert.equal(detalle.datos.estado, 'cancelada');
  assert.equal(detalle.datos.lineas[0].cantidad, 3);
  assert.equal(detalle.datos.metodo_pago, null);
});

// ---------------------------------------------------------------------------
// Confirmar
// ---------------------------------------------------------------------------

test('confirmar descuenta el stock y guarda detalle y movimientos juntos (RF-25, RF-31, RF-32, RF-41)', async () => {
  const cajero = await nuevoCajero();
  const pan = await nuevoProducto({ stock: 10, minimo: 8 });
  const tomate = await nuevoProducto({ precio: 1590, unidad: 'kilo', stock: 5.5 });
  const ventaId = await armarVenta(cajero.token, [[pan, 3], [tomate, 0.35]]);

  const r = await confirmar(cajero.token, ventaId, { metodo_pago: 'debito' });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.venta.total, 3557);
  assert.equal(await stockDe(pan), 7);
  assert.equal(await stockDe(tomate), 5.15);
  // RF-32: el estado de stock de lo vendido se recalcula (mínimo 8, quedan 7)
  assert.equal(r.datos.productos.find((p) => p.id === pan).estado_stock, 'bajo');

  const [movimientos] = await pool.query(
    "SELECT producto_id, tipo, cantidad, usuario_id FROM movimientos_stock WHERE venta_id = ? ORDER BY producto_id", [ventaId]
  );
  assert.equal(movimientos.length, 2);
  assert.equal(movimientos[0].tipo, 'venta');
  assert.equal(Number(movimientos[0].cantidad), -3);
  assert.equal(Number(movimientos[1].cantidad), -0.35);
  assert.equal(movimientos[0].usuario_id, cajero.id);

  const [[venta]] = await pool.query('SELECT estado, metodo_pago, total FROM ventas WHERE id = ?', [ventaId]);
  assert.deepEqual([venta.estado, venta.metodo_pago, Number(venta.total)], ['completada', 'debito', 3557]);

  const historial = await peticion(`/productos/${pan}/movimientos`);
  assert.equal(historial.datos[0].tipo, 'venta');
  assert.equal(historial.datos[0].venta_id, ventaId);
});

test('si el stock bajó antes de confirmar se rechaza TODA la venta y el carrito queda intacto (RF-26)', async () => {
  const cajero = await nuevoCajero();
  const a = await nuevoProducto({ stock: 10 });
  const b = await nuevoProducto({ stock: 10 });
  const ventaId = await armarVenta(cajero.token, [[a, 5], [b, 2]]);

  await pool.query('UPDATE productos SET stock = 3 WHERE id = ?', [a]); // otro mesón o un ajuste
  const r = await confirmar(cajero.token, ventaId);
  assert.equal(r.estado, 409);
  assert.equal(r.datos.codigo, 'STOCK_INSUFICIENTE');
  assert.equal(r.datos.problemas.length, 1);
  assert.equal(r.datos.problemas[0].productoId, a);
  assert.equal(r.datos.problemas[0].stockDisponible, 3);

  assert.equal(await stockDe(a), 3);
  assert.equal(await stockDe(b), 10); // nada se descontó, ni siquiera lo que sí alcanzaba
  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  assert.equal(enCurso.datos.ventaActiva.id, ventaId);
  assert.equal(enCurso.datos.lineas.length, 2);
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
});

test('un producto desactivado con el carrito armado bloquea la confirmación hasta quitarlo (RF-27)', async () => {
  const cajero = await nuevoCajero();
  const a = await nuevoProducto();
  const b = await nuevoProducto();
  const ventaId = await armarVenta(cajero.token, [[a, 1], [b, 1]]);

  await peticion(`/productos/${b}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });
  let r = await confirmar(cajero.token, ventaId);
  assert.equal(r.estado, 409);
  assert.equal(r.datos.codigo, 'PRODUCTO_DESACTIVADO');
  assert.match(r.datos.mensaje, /quítalo/);

  await peticion(`/ventas/${ventaId}/lineas/${b}`, { metodo: 'DELETE', token: cajero.token });
  r = await confirmar(cajero.token, ventaId);
  assert.equal(r.estado, 200);
});

test('si falla una parte de la confirmación no queda nada a medias: reversa total (RF-28, RNF-3)', async () => {
  const cajero = await nuevoCajero();
  const a = await nuevoProducto({ stock: 10 });
  const b = await nuevoProducto({ stock: 4 });
  const ventaId = await armarVenta(cajero.token, [[a, 2], [b, 1]]);

  // Una cuenta inexistente rompe la inserción del movimiento de stock (clave foránea).
  await assert.rejects(ventasModelo.confirmar({
    ventaId, usuarioId: 987654, metodoPago: 'debito', hoy: new Date(),
  }));

  assert.equal(await stockDe(a), 10);
  assert.equal(await stockDe(b), 4);
  const [[venta]] = await pool.query('SELECT estado FROM ventas WHERE id = ?', [ventaId]);
  assert.equal(venta.estado, 'en_curso');
  const [[movimientos]] = await pool.query('SELECT COUNT(*) AS n FROM movimientos_stock WHERE venta_id = ?', [ventaId]);
  assert.equal(movimientos.n, 0);

  // El carrito sigue en pie y se puede confirmar con una cuenta válida
  assert.equal((await confirmar(cajero.token, ventaId)).estado, 200);
});

test('dos ventas simultáneas del último producto: una se confirma y la otra se rechaza, sin stock negativo (RF-29)', async () => {
  const uno = await nuevoCajero();
  const dos = await nuevoCajero();
  const ultimo = await nuevoProducto({ stock: 1 });
  const ventaUno = await armarVenta(uno.token, [[ultimo, 1]]);
  const ventaDos = await armarVenta(dos.token, [[ultimo, 1]]);

  const [r1, r2] = await Promise.all([confirmar(uno.token, ventaUno), confirmar(dos.token, ventaDos)]);
  assert.deepEqual([r1.estado, r2.estado].sort(), [200, 409]);
  const rechazada = [r1, r2].find((r) => r.estado === 409);
  assert.equal(rechazada.datos.codigo, 'STOCK_INSUFICIENTE');
  assert.equal(rechazada.datos.problemas[0].stockDisponible, 0);
  assert.equal(await stockDe(ultimo), 0);

  const [[movimientos]] = await pool.query("SELECT COUNT(*) AS n FROM movimientos_stock WHERE producto_id = ? AND tipo = 'venta'", [ultimo]);
  assert.equal(movimientos.n, 1);
  // La rechazada conserva su carrito
  await peticion(`/ventas/${r1.estado === 409 ? ventaUno : ventaDos}/cancelar`, {
    metodo: 'POST', token: r1.estado === 409 ? uno.token : dos.token,
  });
});

test('una venta y un ajuste manual simultáneos sobre el mismo producto nunca dejan stock negativo (spec 002, RF-27)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 5 });
  const ventaId = await armarVenta(cajero.token, [[producto, 4]]);

  const [venta, ajuste] = await Promise.all([
    confirmar(cajero.token, ventaId),
    peticion(`/productos/${producto}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 3, nota: 'Rotura' } }),
  ]);

  const exitos = [venta.estado === 200, ajuste.estado === 200].filter(Boolean).length;
  assert.equal(exitos, 1, `venta ${venta.estado}, ajuste ${ajuste.estado}`); // 5 - 4 - 3 < 0: solo cabe uno
  const stock = await stockDe(producto);
  assert.ok(stock >= 0);
  assert.equal(stock, venta.estado === 200 ? 1 : 2);
  if (venta.estado !== 200) {
    await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
  }
});

test('no se confirma una venta vacía ni dos veces la misma venta (RF-30)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 10 });
  const vacia = await iniciar(cajero.token);
  const r = await confirmar(cajero.token, vacia);
  assert.deepEqual([r.estado, r.datos.codigo], [409, 'CARRITO_VACIO']);
  await agregar(cajero.token, vacia, producto, 2);

  const primera = await confirmar(cajero.token, vacia);
  assert.equal(primera.estado, 200);
  const segunda = await confirmar(cajero.token, vacia);
  assert.equal(segunda.estado, 409);
  assert.equal(segunda.datos.codigo, 'VENTA_YA_CONFIRMADA');
  assert.equal(segunda.datos.venta.id, vacia);
  assert.equal(await stockDe(producto), 8); // se descontó una sola vez

  // La última venta confirmada se puede consultar para ver su estado real (corte de conexión)
  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  assert.equal(enCurso.datos.ventaActiva, null);
  assert.equal(enCurso.datos.ultimaVenta.id, vacia);

  // Doble envío simultáneo: una sola venta
  const otra = await nuevoCajero();
  const ventaId = await armarVenta(otra.token, [[producto, 1]]);
  const [x, y] = await Promise.all([confirmar(otra.token, ventaId), confirmar(otra.token, ventaId)]);
  assert.deepEqual([x.estado, y.estado].sort(), [200, 409]);
  assert.equal(await stockDe(producto), 7);
});

test('en efectivo se exige el monto y se devuelve el vuelto; débito y crédito solo registran el método (RF-14–16)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1290, stock: 20 });

  const v1 = await armarVenta(cajero.token, [[producto, 2]]); // 2.580
  assert.equal((await confirmar(cajero.token, v1, { metodo_pago: 'cheque' })).estado, 400);
  assert.equal((await confirmar(cajero.token, v1, { metodo_pago: 'efectivo' })).datos.codigo, 'MONTO_INVALIDO');
  const corto = await confirmar(cajero.token, v1, { metodo_pago: 'efectivo', monto_recibido: 2000 });
  assert.equal(corto.estado, 400);
  assert.equal(corto.datos.codigo, 'MONTO_INSUFICIENTE');
  assert.equal(corto.datos.faltan, 580);
  assert.equal(await stockDe(producto), 20);

  const ok = await confirmar(cajero.token, v1, { metodo_pago: 'efectivo', monto_recibido: 5000 });
  assert.equal(ok.estado, 200);
  assert.equal(ok.datos.vuelto, 2420);

  const v2 = await armarVenta(cajero.token, [[producto, 1]]);
  const credito = await confirmar(cajero.token, v2, { metodo_pago: 'credito' });
  assert.equal(credito.estado, 200);
  assert.equal(credito.datos.vuelto, null);
  const [[fila]] = await pool.query('SELECT metodo_pago FROM ventas WHERE id = ?', [v2]);
  assert.equal(fila.metodo_pago, 'credito');
});

// ---------------------------------------------------------------------------
// Clientes y fiado
// ---------------------------------------------------------------------------

test('se registra un cliente con solo su RUT (con o sin nombre) y se valida el dígito verificador (RF-20, RNF-10)', async () => {
  const sinNombre = await registrarCliente(rutValido(11111111));
  assert.equal(sinNombre.nombre, null);
  assert.equal(sinNombre.saldo, 0);
  assert.match(sinNombre.rut_formateado, /^\d{1,2}\.\d{3}\.\d{3}-[\dK]$/);

  const conNombre = await registrarCliente(rutValido(22222222), '  Rosa   Soto ');
  assert.equal(conNombre.nombre, 'Rosa Soto');

  const invalido = await peticion('/clientes', { metodo: 'POST', cuerpo: { rut: '11.111.111-0' } });
  assert.equal(invalido.estado, 400);
  assert.equal(invalido.datos.codigo, 'RUT_INVALIDO');
  assert.equal((await peticion('/clientes', { metodo: 'POST', cuerpo: { rut: 'abc' } })).estado, 400);
  assert.equal((await peticion('/clientes', { metodo: 'POST', cuerpo: { rut: rutValido(33333333), nombre: 7 } })).estado, 400);
});

test('un RUT ya registrado se reconoce aunque se escriba distinto y no se duplica (RF-21)', async () => {
  const rut = rutValido(44444444);
  const original = await registrarCliente(rut);
  const sinPuntos = rut.replace('-', '');
  const conPuntos = original.rut_formateado;

  for (const variante of [sinPuntos, conPuntos, rut.toLowerCase()]) {
    const r = await peticion('/clientes', { metodo: 'POST', cuerpo: { rut: variante, nombre: 'Otro' } });
    assert.equal(r.estado, 409, variante);
    assert.equal(r.datos.codigo, 'RUT_REPETIDO');
    assert.equal(r.datos.cliente.id, original.id);
  }
  const [[total]] = await pool.query('SELECT COUNT(*) AS n FROM clientes WHERE rut = ?', [rut]);
  assert.equal(total.n, 1);

  const buscado = await peticion(`/clientes/rut/${conPuntos}`);
  assert.equal(buscado.estado, 200);
  assert.equal(buscado.datos.id, original.id);
  assert.equal((await peticion(`/clientes/rut/${rutValido(55555555)}`)).datos.codigo, 'CLIENTE_NO_REGISTRADO');
  assert.equal((await peticion('/clientes/rut/11.111.111-0')).estado, 400);
});

test('el cajero registra clientes y, desde la spec 004, ve su cuenta y el listado; el total por cobrar y los cambios de RUT son del administrador (RF-20; spec 004 RF-6, RF-7, RF-25)', async () => {
  const cajero = await nuevoCajero();
  const registrado = await peticion('/clientes', { metodo: 'POST', token: cajero.token, cuerpo: { rut: rutValido(66666666) } });
  assert.equal(registrado.estado, 201);
  const id = registrado.datos.cliente.id;
  const campos = ['creado_en', 'direccion', 'email', 'estado', 'id', 'nombre', 'rut', 'rut_formateado', 'saldo', 'telefono'];
  assert.deepEqual(Object.keys(registrado.datos.cliente).sort(), campos);

  const consulta = await peticion(`/clientes/rut/${rutValido(66666666)}`, { token: cajero.token });
  assert.deepEqual(Object.keys(consulta.datos).sort(), campos);

  // El cajero ve la cuenta y el listado, sin el historial de cambios de RUT ni el total por cobrar
  const deCajero = await peticion(`/clientes/${id}/cuenta`, { token: cajero.token });
  assert.equal(deCajero.estado, 200);
  assert.deepEqual([deCajero.datos.compras, deCajero.datos.movimientos], [[], []]);
  assert.equal('cambios_rut' in deCajero.datos, false);
  const listaCajero = await peticion('/clientes', { token: cajero.token });
  assert.equal(listaCajero.estado, 200);
  assert.equal('resumen' in listaCajero.datos, false);

  const admin = await peticion(`/clientes/${id}/cuenta`);
  assert.equal(admin.estado, 200);
  assert.deepEqual([admin.datos.compras, admin.datos.movimientos, admin.datos.cambios_rut], [[], [], []]);
  const listaAdmin = await peticion('/clientes');
  assert.deepEqual(Object.keys(listaAdmin.datos.resumen).sort(), ['clientes_en_deuda', 'total_por_cobrar']);
  assert.equal((await peticion('/clientes/999999/cuenta')).estado, 404);
  assert.equal((await peticion('/clientes/999999/cuenta', { token: cajero.token })).estado, 404);
});

test('el cajero solo abre el detalle de las compras del cliente cuya cuenta ve, sin acceso al historial (spec 004, RF-7, RF-9)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ nombre: 'Detalle visible', costo: 555, precio: 1200, stock: 20 });
  const cliente = await registrarCliente(rutValido(31000001), 'Dueña de la compra');
  const ajeno = await registrarCliente(rutValido(31000002), 'Otra persona');
  const ventaId = await armarVenta(cajero.token, [[producto, 2]]);
  await confirmar(cajero.token, ventaId, { metodo_pago: 'debito', cliente_id: cliente.id });

  const detalle = await peticion(`/clientes/${cliente.id}/compras/${ventaId}`, { token: cajero.token });
  assert.equal(detalle.estado, 200);
  assert.equal(detalle.datos.total, 2400);
  assert.equal(detalle.datos.lineas[0].nombre, 'Detalle visible');
  assert.equal(JSON.stringify(detalle.datos).includes('555'), false, 'el costo no viaja');
  assert.equal(JSON.stringify(detalle.datos).includes('costo'), false);

  // De otro cliente, inexistente o sin cerrar: 404. El historial sigue siendo del administrador
  assert.equal((await peticion(`/clientes/${ajeno.id}/compras/${ventaId}`, { token: cajero.token })).estado, 404);
  assert.equal((await peticion(`/clientes/${cliente.id}/compras/999999`, { token: cajero.token })).estado, 404);
  assert.equal((await peticion(`/ventas/${ventaId}`, { token: cajero.token })).estado, 403);
  assert.equal((await peticion('/ventas', { token: cajero.token })).estado, 403);
  assert.equal((await peticion(`/clientes/${cliente.id}/compras/${ventaId}`)).estado, 200);
});

test('el cajero edita los datos de contacto del cliente y un texto vacío borra el dato (spec 004, RF-20)', async () => {
  const cajero = await nuevoCajero();
  const cliente = await registrarCliente(rutValido(31000003));

  const guardado = await peticion(`/clientes/${cliente.id}`, {
    metodo: 'PATCH', token: cajero.token,
    cuerpo: { nombre: '  Rosa   Soto ', telefono: '+56 9 8765 4321', email: 'rosa@correo.cl', direccion: 'Calle 1' },
  });
  assert.equal(guardado.estado, 200);
  assert.equal(guardado.datos.cliente.nombre, 'Rosa Soto');
  assert.equal(guardado.datos.cliente.telefono, '+56 9 8765 4321');

  const borrado = await peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', token: cajero.token, cuerpo: { email: '' } });
  assert.equal(borrado.datos.cliente.email, null);
  assert.equal(borrado.datos.cliente.nombre, 'Rosa Soto');

  assert.equal((await peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', token: cajero.token, cuerpo: { email: 'sin-arroba' } })).estado, 400);
  assert.equal((await peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', token: cajero.token, cuerpo: {} })).estado, 400);
  assert.equal((await peticion('/clientes/999999', { metodo: 'PATCH', token: cajero.token, cuerpo: { nombre: 'x' } })).estado, 404);
});

test('el fiado exige cliente, crea el cargo por el total y suma a la deuda previa sin bloquear (RF-17, RF-18, RF-25)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 2000, stock: 20 });
  const cliente = await registrarCliente(rutValido(77777777), 'Beto');

  const v1 = await armarVenta(cajero.token, [[producto, 2]]); // 4.000
  assert.equal((await confirmar(cajero.token, v1, { metodo_pago: 'fiado' })).datos.codigo, 'FIADO_SIN_CLIENTE');
  assert.equal((await confirmar(cajero.token, v1, { metodo_pago: 'fiado', cliente_id: 999999 })).estado, 400);
  const ok = await confirmar(cajero.token, v1, { metodo_pago: 'fiado', cliente_id: cliente.id });
  assert.equal(ok.estado, 200);
  assert.deepEqual(ok.datos.cliente, { saldo: 4000, estado: 'deuda' });

  // Con deuda previa se vende igual y la venta suma al saldo
  const v2 = await armarVenta(cajero.token, [[producto, 1]]); // 2.000
  const consulta = await peticion(`/clientes/rut/${cliente.rut}`, { token: cajero.token });
  assert.deepEqual([consulta.datos.saldo, consulta.datos.estado], [4000, 'deuda']);
  const segunda = await confirmar(cajero.token, v2, { metodo_pago: 'fiado', cliente_id: cliente.id });
  assert.equal(segunda.datos.cliente.saldo, 6000);

  const [cargos] = await pool.query("SELECT tipo, monto FROM fiado_transacciones WHERE cliente_id = ? AND tipo = 'cargo'", [cliente.id]);
  assert.equal(cargos.length, 2);
  assert.equal(await saldoDe(cliente.id), 6000);
});

test('una compra al contado asociada a un RUT queda en su cuenta sin deuda (RF-22, RF-23)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000, stock: 20 });
  const cliente = await registrarCliente(rutValido(88888888));

  const ventaId = await armarVenta(cajero.token, [[producto, 1]]);
  const r = await confirmar(cajero.token, ventaId, { metodo_pago: 'debito', cliente_id: cliente.id });
  assert.deepEqual(r.datos.cliente, { saldo: 0, estado: 'al_dia' });

  const cuenta = await peticion(`/clientes/${cliente.id}/cuenta`);
  assert.equal(cuenta.datos.compras.length, 1);
  assert.equal(cuenta.datos.compras[0].id, ventaId);
  assert.deepEqual(cuenta.datos.movimientos, []);
  assert.equal(cuenta.datos.cliente.estado, 'al_dia');
});

test('el costo y el margen no viajan en ninguna respuesta del cajero (RF-49, RNF-9)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ nombre: 'Producto sin costo visible', costo: 777, precio: 1000, stock: 10 });
  const ventaId = await armarVenta(cajero.token, [[producto, 1]]);

  const vendibles = await peticion('/productos/vendibles?buscar=Producto sin costo', { token: cajero.token });
  assert.equal(vendibles.datos.length, 1);
  const enCurso = await peticion('/ventas/en-curso', { token: cajero.token });
  const confirmada = await confirmar(cajero.token, ventaId);
  const ultima = await peticion('/ventas/en-curso', { token: cajero.token });
  for (const respuesta of [vendibles, enCurso, confirmada, ultima]) {
    const texto = JSON.stringify(respuesta.datos);
    assert.equal(texto.includes('precio_costo'), false);
    assert.equal(texto.includes('margen'), false);
  }
  // El cajero tampoco ve el historial ni el detalle de ventas
  assert.equal((await peticion('/ventas', { token: cajero.token })).estado, 403);
  assert.equal((await peticion(`/ventas/${ventaId}`, { token: cajero.token })).estado, 403);
});

// ---------------------------------------------------------------------------
// Historial y detalle
// ---------------------------------------------------------------------------

test('el historial muestra hoy por defecto, filtra por estado y fecha, y solo las completadas suman (RF-35–37, RF-40)', async () => {
  const antes = await resumenDelDia();
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000, stock: 50 });

  const completada = await armarVenta(cajero.token, [[producto, 2]]); // 2.000
  await confirmar(cajero.token, completada);
  const anulada = await armarVenta(cajero.token, [[producto, 3]]); // 3.000
  await confirmar(cajero.token, anulada);
  await peticion(`/ventas/${anulada}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Error de caja' } });
  const cancelada = await armarVenta(cajero.token, [[producto, 1]]);
  await peticion(`/ventas/${cancelada}/cancelar`, { metodo: 'POST', token: cajero.token });

  const hoy = await peticion('/ventas');
  assert.equal(hoy.estado, 200);
  const despues = hoy.datos.resumen;
  assert.equal(despues.completadas.cantidad - antes.completadas.cantidad, 1);
  assert.equal(despues.completadas.total - antes.completadas.total, 2000); // la anulada no suma
  assert.equal(despues.anuladas.cantidad - antes.anuladas.cantidad, 1);
  assert.equal(despues.canceladas.cantidad - antes.canceladas.cantidad, 1);

  const estados = new Map(hoy.datos.ventas.map((v) => [v.id, v.estado]));
  assert.equal(estados.get(completada), 'completada');
  assert.equal(estados.get(anulada), 'anulada');
  assert.equal(estados.get(cancelada), 'cancelada');
  const ids = hoy.datos.ventas.map((v) => v.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a)); // de la más reciente a la más antigua

  // Filtro por estado: el resumen del período no cambia
  const soloAnuladas = await peticion('/ventas?estado=anulada');
  assert.ok(soloAnuladas.datos.ventas.every((v) => v.estado === 'anulada'));
  assert.equal(soloAnuladas.datos.resumen.completadas.total, despues.completadas.total);
  const canceladas = await peticion('/ventas?estado=canceladas');
  assert.ok(canceladas.datos.ventas.every((v) => v.estado.startsWith('cancelada')));
  assert.equal((await peticion('/ventas?estado=raro')).estado, 400);

  // Rango de fechas: otro día no incluye estas ventas
  const antiguo = await peticion('/ventas?desde=2001-01-01&hasta=2001-01-31');
  assert.deepEqual([antiguo.datos.ventas.length, antiguo.datos.resumen.completadas.total], [0, 0]);
  assert.equal((await peticion('/ventas?desde=hoy')).estado, 400);
  assert.equal((await peticion('/ventas?desde=2026-03-02&hasta=2026-03-01')).estado, 400);
  const rangoAmplio = await peticion('/ventas?desde=2001-01-01&hasta=2099-12-31');
  assert.ok(rangoAmplio.datos.ventas.some((v) => v.id === completada));

  // Una venta en curso no aparece en el historial (RF-35)
  const enCurso = await armarVenta(cajero.token, [[producto, 1]]);
  const conEnCurso = await peticion('/ventas');
  assert.equal(conEnCurso.datos.ventas.some((v) => v.id === enCurso), false);
  assert.equal((await peticion(`/ventas/${enCurso}`)).estado, 404);
  await peticion(`/ventas/${enCurso}/cancelar`, { metodo: 'POST', token: cajero.token });
});

test('el detalle de una venta completada y de una anulada trae lo que pide la spec (RF-38)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ nombre: 'Detalle Pan', precio: 1200, stock: 30 });
  const cliente = await registrarCliente(rutValido(12121212), 'Rosa');
  const ventaId = await armarVenta(cajero.token, [[producto, 2]]);
  await confirmar(cajero.token, ventaId, { metodo_pago: 'fiado', cliente_id: cliente.id });

  let detalle = (await peticion(`/ventas/${ventaId}`)).datos;
  assert.equal(detalle.estado, 'completada');
  assert.equal(detalle.metodo_pago, 'fiado');
  assert.ok(detalle.cajero_nombre.startsWith('Cajero'));
  assert.equal(detalle.cliente_rut, cliente.rut);
  assert.equal(detalle.cliente_rut_formateado, cliente.rut_formateado);
  assert.deepEqual(detalle.lineas.map((l) => [l.nombre, l.cantidad, l.precio_unitario, l.subtotal]),
    [['Detalle Pan', 2, 1200, 2400]]);
  assert.equal(JSON.stringify(detalle).includes('precio_costo'), false);

  await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Cobro duplicado' } });
  detalle = (await peticion(`/ventas/${ventaId}`)).datos;
  assert.equal(detalle.estado, 'anulada');
  assert.equal(detalle.anulada_por_nombre, 'Dueño');
  assert.equal(detalle.motivo_anulacion, 'Cobro duplicado');
  assert.ok(detalle.anulada_en);
  assert.equal((await peticion('/ventas/999999')).estado, 404);
  assert.equal((await peticion('/ventas/abc')).estado, 404);
});

// ---------------------------------------------------------------------------
// Anular
// ---------------------------------------------------------------------------

test('el administrador anula con motivo: el stock vuelve, queda constancia y no se anula dos veces (RF-42–47)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 10 });
  const ventaId = await armarVenta(cajero.token, [[producto, 4]]);
  await confirmar(cajero.token, ventaId);
  assert.equal(await stockDe(producto), 6);

  assert.equal((await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', token: cajero.token, cuerpo: { motivo: 'x' } })).estado, 403);
  assert.equal((await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: { motivo: '   ' } })).estado, 400);
  assert.equal((await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: {} })).estado, 400);
  assert.equal(await stockDe(producto), 6);

  // Sin límite de tiempo: la venta se pudo hacer hace semanas
  await pool.query('UPDATE ventas SET fecha = DATE_SUB(NOW(), INTERVAL 45 DAY) WHERE id = ?', [ventaId]);
  const r = await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Cobro duplicado' } });
  assert.equal(r.estado, 200);
  assert.equal(await stockDe(producto), 10);

  const [[venta]] = await pool.query('SELECT estado, anulada_por, anulada_en, motivo_anulacion FROM ventas WHERE id = ?', [ventaId]);
  assert.deepEqual([venta.estado, venta.anulada_por, venta.motivo_anulacion], ['anulada', idAdmin, 'Cobro duplicado']);
  assert.ok(venta.anulada_en);
  const [[mov]] = await pool.query("SELECT cantidad, nota, usuario_id FROM movimientos_stock WHERE venta_id = ? AND tipo = 'anulacion_venta'", [ventaId]);
  assert.equal(Number(mov.cantidad), 4);
  assert.equal(mov.nota, 'Cobro duplicado');
  assert.equal(mov.usuario_id, idAdmin);

  const otra = await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: { motivo: 'otra vez' } });
  assert.deepEqual([otra.estado, otra.datos.codigo], [409, 'YA_ANULADA']);
  assert.equal(await stockDe(producto), 10);

  // No se anula una venta en curso ni una cancelada
  const enCurso = await armarVenta(cajero.token, [[producto, 1]]);
  assert.equal((await peticion(`/ventas/${enCurso}/anular`, { metodo: 'POST', cuerpo: { motivo: 'x' } })).datos.codigo, 'NO_CONFIRMADA');
  await peticion(`/ventas/${enCurso}/cancelar`, { metodo: 'POST', token: cajero.token });
  assert.equal((await peticion(`/ventas/${enCurso}/anular`, { metodo: 'POST', cuerpo: { motivo: 'x' } })).datos.codigo, 'NO_CONFIRMADA');
  assert.equal((await peticion('/ventas/999999/anular', { metodo: 'POST', cuerpo: { motivo: 'x' } })).estado, 404);
});

test('se puede anular aunque el producto se haya desactivado o el cajero ya no exista como activo (RF-43)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 10 });
  const ventaId = await armarVenta(cajero.token, [[producto, 3]]);
  await confirmar(cajero.token, ventaId);

  await peticion(`/productos/${producto}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });
  await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [cajero.id]);

  const r = await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Corrección' } });
  assert.equal(r.estado, 200);
  assert.equal(await stockDe(producto), 10);
  const detalle = await peticion(`/ventas/${ventaId}`);
  assert.equal(detalle.datos.cajero_nombre.startsWith('Cajero'), true); // su historial se conserva
});

test('anular una venta fiada descuenta la deuda; con abonos previos queda saldo a favor y todo cuadra (RF-43, RF-44, RNF-3)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ precio: 1000, stock: 30 });
  const cliente = await registrarCliente(rutValido(13131313));

  const v1 = await armarVenta(cajero.token, [[producto, 3]]); // 3.000
  await confirmar(cajero.token, v1, { metodo_pago: 'fiado', cliente_id: cliente.id });
  const v2 = await armarVenta(cajero.token, [[producto, 2]]); // 2.000
  await confirmar(cajero.token, v2, { metodo_pago: 'fiado', cliente_id: cliente.id });
  assert.equal(await saldoDe(cliente.id), 5000);

  // Abono (lo registrará la spec de clientes y fiado): el cliente paga 4.000
  await pool.query(`INSERT INTO fiado_transacciones (cliente_id, usuario_id, tipo, monto, observacion)
                    VALUES (?, ?, 'abono', 4000, 'Abono de prueba')`, [cliente.id, idAdmin]);
  assert.equal(await saldoDe(cliente.id), 1000);

  // Anular la de 3.000: queda 1.000 - 3.000 = -2.000 a favor del cliente, sin error
  const r = await peticion(`/ventas/${v1}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Error de caja' } });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.saldo, -2000);
  assert.equal(r.datos.estado_cuenta, 'a_favor');
  assert.match(r.datos.mensaje, /\$2\.000 a su favor/);

  const consulta = await peticion(`/clientes/rut/${cliente.rut}`);
  assert.deepEqual([consulta.datos.saldo, consulta.datos.estado], [-2000, 'a_favor']);

  // Conciliación: cargos - abonos - anulaciones = saldo de la vista
  const [[suma]] = await pool.query(
    `SELECT SUM(CASE tipo WHEN 'cargo' THEN monto ELSE -monto END) AS saldo
     FROM fiado_transacciones WHERE cliente_id = ?`, [cliente.id]);
  assert.equal(Number(suma.saldo), await saldoDe(cliente.id));

  // La cuenta muestra la compra anulada marcada como tal y los tres tipos de movimiento
  const cuenta = (await peticion(`/clientes/${cliente.id}/cuenta`)).datos;
  assert.deepEqual(cuenta.compras.map((c) => [c.id, c.estado]).sort(), [[v1, 'anulada'], [v2, 'completada']].sort());
  assert.deepEqual(cuenta.movimientos.map((m) => m.tipo).sort(), ['abono', 'anulacion', 'cargo', 'cargo']);

  // El índice único impide una segunda anulación de la misma venta aunque falle otra validación
  await assert.rejects(pool.query(
    `INSERT INTO fiado_transacciones (cliente_id, venta_id, usuario_id, tipo, monto)
     VALUES (?, ?, ?, 'anulacion', 3000)`, [cliente.id, v1, idAdmin]), { code: 'ER_DUP_ENTRY' });
});

// ---------------------------------------------------------------------------
// Cuenta desactivada con venta en curso (spec 001)
// ---------------------------------------------------------------------------

test('un cajero desactivado puede terminar su venta, pero no iniciar otra, y pierde el acceso al confirmar (spec 001, RF-15)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 10 });
  const ventaId = await armarVenta(cajero.token, [[producto, 1]]);
  await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [cajero.id]);

  // Rutas ajenas al cobro y una venta nueva siguen bloqueadas
  assert.equal((await peticion('/ventas/iniciar', { metodo: 'POST', token: cajero.token })).estado, 403);
  assert.equal((await peticion('/productos', { token: cajero.token })).estado, 403);
  assert.equal((await peticion('/ventas', { token: cajero.token })).estado, 403);

  // Terminar la venta: ver el carrito, buscar, editar, identificar cliente y confirmar
  assert.equal((await peticion('/ventas/en-curso', { token: cajero.token })).estado, 200);
  assert.equal((await peticion('/productos/vendibles', { token: cajero.token })).estado, 200);
  assert.equal((await agregar(cajero.token, ventaId, producto, 1)).estado, 200);
  const cliente = await peticion('/clientes', { metodo: 'POST', token: cajero.token, cuerpo: { rut: rutValido(14141414) } });
  assert.equal(cliente.estado, 201);
  const r = await confirmar(cajero.token, ventaId, { metodo_pago: 'debito', cliente_id: cliente.datos.cliente.id });
  assert.equal(r.estado, 200);

  // Al terminar, la sesión se invalida al momento
  assert.equal((await peticion('/ventas/en-curso', { token: cajero.token })).estado, 401);
});

// ---------------------------------------------------------------------------
// Idioma
// ---------------------------------------------------------------------------

test('los mensajes principales de la venta están en español (RNF-6)', async () => {
  const cajero = await nuevoCajero();
  const producto = await nuevoProducto({ stock: 1 });
  const ventaId = await iniciar(cajero.token);

  const mensajes = [
    (await agregar(cajero.token, ventaId, producto, 5)).datos.mensaje,
    (await agregar(cajero.token, ventaId, 999999, 1)).datos.mensaje,
    (await confirmar(cajero.token, ventaId)).datos.mensaje,
    (await confirmar(cajero.token, ventaId, { metodo_pago: 'fiado' })).datos.mensaje,
    (await peticion('/clientes', { metodo: 'POST', token: cajero.token, cuerpo: { rut: '1-9' } })).datos.mensaje,
    (await peticion(`/ventas/${ventaId}/anular`, { metodo: 'POST', cuerpo: {} })).datos.mensaje,
  ];
  for (const mensaje of mensajes) {
    assert.ok(typeof mensaje === 'string' && mensaje.length > 0);
    assert.doesNotMatch(mensaje, /\b(error|invalid|not found|insufficient|required)\b/i, mensaje);
  }
  await peticion(`/ventas/${ventaId}/cancelar`, { metodo: 'POST', token: cajero.token });
});
