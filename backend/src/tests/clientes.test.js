// Pruebas de integración de la spec 004 (clientes y fiado) contra MySQL.
// Se ejecutan aparte: npm run test:integracion
// Usan su propia base (almacenpro_test_clientes) para no chocar con las otras suites, que node --test
// ejecuta en paralelo, ni tocar la base real.
process.env.DB_NAME = process.env.DB_NAME ?? 'almacenpro_test_clientes';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-pruebas-spec004';

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
const clientesModelo = await import('../models/clientes.model.js');
const { emitirToken } = await import('../services/credenciales.js');
const { calcularSaldo } = await import('../utils/clientes.js');

const directorio = path.dirname(fileURLToPath(import.meta.url));
const rutaEsquema = path.resolve(directorio, '../../database/schema.sql');

let servidor;
let tokenAdmin;
let idAdmin;
let tokenCajero;
let idCajero;
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

// Crea un cliente por la API; el RUT es único en cada llamada.
async function nuevoCliente({ nombre, token = tokenAdmin } = {}) {
  contador += 1;
  const rut = rutValido(40000000 + contador);
  const respuesta = await peticion('/clientes', { metodo: 'POST', token, cuerpo: { rut, nombre } });
  assert.equal(respuesta.estado, 201, JSON.stringify(respuesta.datos));
  return respuesta.datos.cliente;
}

// Cliente con una deuda de "monto" pesos: una venta al fiado ya confirmada y su cargo.
async function clienteConDeuda(monto, nombre) {
  const cliente = await nuevoCliente({ nombre });
  await cargarDeuda(cliente.id, monto);
  return cliente;
}

async function cargarDeuda(clienteId, monto) {
  const [venta] = await pool.query(
    "INSERT INTO ventas (usuario_id, cliente_id, total, metodo_pago, estado) VALUES (?, ?, ?, 'fiado', 'completada')",
    [idAdmin, clienteId, monto]
  );
  await pool.query(
    "INSERT INTO fiado_transacciones (cliente_id, venta_id, usuario_id, tipo, monto) VALUES (?, ?, ?, 'cargo', ?)",
    [clienteId, venta.insertId, idAdmin, monto]
  );
  return venta.insertId;
}

async function saldoDe(clienteId) {
  const [[fila]] = await pool.query('SELECT saldo_fiado FROM v_saldo_fiado WHERE cliente_id = ?', [clienteId]);
  return Number(fila.saldo_fiado);
}

function abonar(clienteId, cuerpo, token = tokenCajero) {
  return peticion(`/clientes/${clienteId}/abonos`, { metodo: 'POST', token, cuerpo });
}

async function nuevoCajero(activo = 1) {
  contador += 1;
  const id = await usuariosModelo.crear({
    nombre: `Cajero ${contador}`, usuario: `cajero${contador}`, passwordHash: 'no-se-usa', rol: 'cajero',
  });
  if (!activo) await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
  return { id, token: emitirToken(await usuariosModelo.buscarPorId(id)) };
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
  idCajero = await usuariosModelo.crear({
    nombre: 'Camila', usuario: 'camila', passwordHash: 'no-se-usa', rol: 'cajero',
  });
  tokenCajero = emitirToken(await usuariosModelo.buscarPorId(idCajero));

  servidor = app.listen(0);
});

after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  await pool.end();
});

// ---------------------------------------------------------------------------
// Listado y búsqueda (RF-1 a RF-6)
// ---------------------------------------------------------------------------

test('el listado se busca por nombre sin importar mayúsculas ni tildes, y los comodines se buscan como texto (RF-2)', async () => {
  const alvaro = await nuevoCliente({ nombre: 'Búsqueda Álvaro Núñez' });
  await nuevoCliente({ nombre: 'Búsqueda 100% Real_Uno' });

  const nombres = async (buscar) => (await peticion(`/clientes?buscar=${encodeURIComponent(buscar)}`, { token: tokenCajero }))
    .datos.clientes.map((c) => c.nombre);

  assert.deepEqual(await nombres('busqueda alvaro'), ['Búsqueda Álvaro Núñez']);
  assert.deepEqual(await nombres('BÚSQUEDA ÁLVARO'), ['Búsqueda Álvaro Núñez']);
  assert.deepEqual(await nombres('nunez'), ['Búsqueda Álvaro Núñez']);
  assert.deepEqual(await nombres('100%'), ['Búsqueda 100% Real_Uno']);
  assert.deepEqual(await nombres('Real_U'), ['Búsqueda 100% Real_Uno']);
  assert.deepEqual(await nombres('Real_X'), []);
  assert.deepEqual(await nombres('Búsqueda  Álvaro'), ['Búsqueda Álvaro Núñez']); // espacios repetidos

  // Sin resultados: lista vacía y total 0, no un error
  const vacia = await peticion('/clientes?buscar=NoExisteNadie', { token: tokenCajero });
  assert.equal(vacia.estado, 200);
  assert.deepEqual([vacia.datos.clientes.length, vacia.datos.total], [0, 0]);
  assert.ok(alvaro.id);
});

test('el listado se busca por RUT con o sin puntos y guion, completo o parcial (RF-2)', async () => {
  const cliente = await nuevoCliente({ nombre: 'Busca por RUT' });
  const [cuerpo, dv] = cliente.rut.split('-');
  const conPuntos = `${cuerpo.slice(0, -6)}.${cuerpo.slice(-6, -3)}.${cuerpo.slice(-3)}-${dv}`;

  const ids = async (buscar) => (await peticion(`/clientes?buscar=${encodeURIComponent(buscar)}`, { token: tokenCajero }))
    .datos.clientes.map((c) => c.id);

  assert.deepEqual(await ids(cliente.rut), [cliente.id]);
  assert.deepEqual(await ids(conPuntos), [cliente.id]);
  assert.deepEqual(await ids(`${cuerpo}${dv}`), [cliente.id]); // sin puntos ni guion
  // Parciales: el cliente aparece (otros RUT parecidos de la base también pueden aparecer)
  assert.deepEqual(await ids(cuerpo.slice(1)), [cliente.id]);
  assert.ok((await ids(cuerpo.slice(0, 5))).includes(cliente.id));
  assert.ok((await ids(conPuntos.slice(0, 6))).includes(cliente.id)); // "xx.xxx"
  assert.ok((await ids(conPuntos.slice(3))).includes(cliente.id)); // ".xxx.xxx-d" sin el comienzo
  assert.ok((await ids(cuerpo.slice(2, 6))).includes(cliente.id));
});

test('el listado filtra por estado y ordena por nombre, con los sin nombre al final, o por deuda (RF-3, RF-4)', async () => {
  const prefijo = 'Orden';
  const mayor = await clienteConDeuda(9000, `${prefijo} B mayor deuda`);
  const menor = await clienteConDeuda(2000, `${prefijo} A menor deuda`);
  const alDia = await nuevoCliente({ nombre: `${prefijo} C al día` });
  const aFavor = await nuevoCliente({ nombre: `${prefijo} D a favor` });
  await abonar(aFavor.id, { monto: 500, metodo_pago: 'efectivo', confirmar_saldo_a_favor: true });
  const sinNombre = await nuevoCliente();
  await peticion(`/clientes/${sinNombre.id}`, { metodo: 'PATCH', cuerpo: { telefono: '+56 9 1111 1111' } });

  const lista = async (consulta) => (await peticion(`/clientes?buscar=${prefijo}&${consulta}`, { token: tokenCajero })).datos;

  const porNombre = await lista('');
  assert.deepEqual(porNombre.clientes.map((c) => c.id), [menor.id, mayor.id, alDia.id, aFavor.id]);

  const enDeuda = await lista('estado=deuda');
  assert.deepEqual(enDeuda.clientes.map((c) => c.id), [mayor.id, menor.id]); // de mayor a menor deuda
  assert.deepEqual(enDeuda.clientes.map((c) => c.saldo), [9000, 2000]);
  assert.deepEqual(enDeuda.clientes.map((c) => c.estado), ['deuda', 'deuda']);

  assert.deepEqual((await lista('estado=deuda&orden=nombre')).clientes.map((c) => c.id), [menor.id, mayor.id]);
  assert.deepEqual((await lista('estado=a_favor')).clientes.map((c) => [c.id, c.saldo, c.estado]), [[aFavor.id, -500, 'a_favor']]);
  assert.deepEqual((await lista('estado=al_dia')).clientes.map((c) => c.id), [alDia.id]);
  assert.deepEqual((await lista('orden=deuda')).clientes[0].id, mayor.id);

  // Los clientes sin nombre se ordenan por RUT y quedan después de los que tienen nombre
  const todos = (await peticion('/clientes', { token: tokenCajero })).datos.clientes;
  const primeroSinNombre = todos.findIndex((c) => c.nombre === null);
  assert.ok(primeroSinNombre > 0);
  assert.ok(todos.slice(primeroSinNombre).every((c) => c.nombre === null), 'los sin nombre van al final');
  const ruts = todos.slice(primeroSinNombre).map((c) => c.rut);
  assert.deepEqual(ruts, [...ruts].sort());
});

test('el listado se pagina de a 25 y rechaza filtros inválidos (RF-1, RNF-2)', async () => {
  for (let i = 0; i < 30; i += 1) await nuevoCliente({ nombre: `Paginado ${String(i).padStart(2, '0')}` });

  const primera = await peticion('/clientes?buscar=Paginado', { token: tokenCajero });
  assert.deepEqual([primera.datos.clientes.length, primera.datos.total, primera.datos.pagina, primera.datos.por_pagina], [25, 30, 1, 25]);
  const segunda = await peticion('/clientes?buscar=Paginado&pagina=2', { token: tokenCajero });
  assert.deepEqual([segunda.datos.clientes.length, segunda.datos.pagina], [5, 2]);
  const ids = new Set([...primera.datos.clientes, ...segunda.datos.clientes].map((c) => c.id));
  assert.equal(ids.size, 30, 'ninguna fila se repite entre páginas');
  assert.equal((await peticion('/clientes?buscar=Paginado&pagina=3', { token: tokenCajero })).datos.clientes.length, 0);

  for (const consulta of ['estado=moroso', 'orden=rut', 'pagina=0', 'pagina=-1', 'pagina=abc', 'pagina=1.5']) {
    const r = await peticion(`/clientes?${consulta}`, { token: tokenCajero });
    assert.equal(r.estado, 400, consulta);
    assert.ok(r.datos.mensaje);
  }
});

test('solo el administrador recibe el total por cobrar, sin compensarlo con los saldos a favor (RF-6)', async () => {
  await clienteConDeuda(4000, 'Resumen deudor');
  const aFavor = await nuevoCliente({ nombre: 'Resumen a favor' });
  await abonar(aFavor.id, { monto: 90000, metodo_pago: 'efectivo', confirmar_saldo_a_favor: true });

  const [[esperado]] = await pool.query(
    'SELECT COUNT(*) AS n, COALESCE(SUM(saldo_fiado), 0) AS total FROM v_saldo_fiado WHERE saldo_fiado > 0'
  );
  const admin = await peticion('/clientes');
  assert.deepEqual(admin.datos.resumen, {
    clientes_en_deuda: Number(esperado.n),
    total_por_cobrar: Number(esperado.total),
  });
  assert.ok(admin.datos.resumen.total_por_cobrar >= 4000);

  const cajero = await peticion('/clientes', { token: tokenCajero });
  assert.equal(cajero.estado, 200);
  assert.equal('resumen' in cajero.datos, false);
  assert.equal(JSON.stringify(cajero.datos).includes('total_por_cobrar'), false);
});

// ---------------------------------------------------------------------------
// Cuenta del cliente y detalle de compras (RF-7, RF-9, RF-25, RF-27)
// ---------------------------------------------------------------------------

test('la cuenta la ven el cajero y el administrador con contacto, compras y movimientos; los cambios de RUT solo el administrador (RF-7, RF-25)', async () => {
  const cliente = await clienteConDeuda(7000, 'Cuenta Completa');
  await peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', cuerpo: { telefono: '+56 9 2222 3333', email: 'cuenta@correo.cl', direccion: 'Calle 5' } });
  await abonar(cliente.id, { monto: 2500, metodo_pago: 'transferencia', observacion: 'Pagó por banco' });

  const deCajero = await peticion(`/clientes/${cliente.id}/cuenta`, { token: tokenCajero });
  assert.equal(deCajero.estado, 200);
  assert.deepEqual(
    [deCajero.datos.cliente.saldo, deCajero.datos.cliente.estado, deCajero.datos.cliente.telefono, deCajero.datos.cliente.email],
    [4500, 'deuda', '+56 9 2222 3333', 'cuenta@correo.cl']
  );
  assert.equal(deCajero.datos.compras.length, 1);
  assert.equal(deCajero.datos.compras[0].total, 7000);
  const [abono, cargo] = deCajero.datos.movimientos; // del más reciente al más antiguo
  assert.deepEqual([abono.tipo, abono.monto, abono.metodo_pago, abono.observacion, abono.usuario_nombre, abono.anulado],
    ['abono', 2500, 'transferencia', 'Pagó por banco', 'Camila', false]);
  assert.deepEqual([cargo.tipo, cargo.monto, cargo.venta_id !== null], ['cargo', 7000, true]);
  assert.equal('cambios_rut' in deCajero.datos, false);

  const deAdmin = await peticion(`/clientes/${cliente.id}/cuenta`);
  assert.deepEqual(deAdmin.datos.cambios_rut, []);
  assert.equal((await peticion('/clientes/999999/cuenta', { token: tokenCajero })).estado, 404);
  assert.equal((await peticion('/clientes/abc/cuenta', { token: tokenCajero })).estado, 404);
  assert.equal((await peticion(`/clientes/${cliente.id}/cuenta`, { token: null })).estado, 401);
});

test('el detalle de una compra anulada se ve desde la cuenta, sin costos, y el cajero no accede al historial (RF-7, RF-9, RNF-8)', async () => {
  const cliente = await nuevoCliente({ nombre: 'Compra anulada' });
  const [producto] = await pool.query(
    "INSERT INTO productos (nombre, precio_venta, precio_costo, stock, categoria_id) VALUES ('Producto de la compra anulada', 1500, 987, 10, 1)"
  );
  const [venta] = await pool.query(
    `INSERT INTO ventas (usuario_id, cliente_id, total, metodo_pago, estado, anulada_por, anulada_en, motivo_anulacion)
     VALUES (?, ?, 3000, 'debito', 'anulada', ?, NOW(), 'Cobro doble')`,
    [idCajero, cliente.id, idAdmin]
  );
  await pool.query(
    'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, 2, 1500, 3000)',
    [venta.insertId, producto.insertId]
  );
  const enCurso = await peticion('/ventas/iniciar', { metodo: 'POST', token: (await nuevoCajero()).token });
  assert.equal(enCurso.estado, 201);

  const detalle = await peticion(`/clientes/${cliente.id}/compras/${venta.insertId}`, { token: tokenCajero });
  assert.equal(detalle.estado, 200);
  assert.deepEqual([detalle.datos.estado, detalle.datos.motivo_anulacion, detalle.datos.anulada_por_nombre], ['anulada', 'Cobro doble', 'Dueño']);
  assert.deepEqual(detalle.datos.lineas.map((l) => [l.nombre, l.cantidad, l.precio_unitario, l.subtotal]),
    [['Producto de la compra anulada', 2, 1500, 3000]]);
  assert.equal(JSON.stringify(detalle.datos).includes('987'), false, 'el costo no viaja');
  assert.equal(JSON.stringify(detalle.datos).toLowerCase().includes('costo'), false, 'el costo no viaja');

  // Una venta en curso no es una compra: 404. El historial sigue siendo del administrador
  const [[idEnCurso]] = await pool.query("SELECT MAX(id) AS id FROM ventas WHERE estado = 'en_curso'");
  assert.equal((await peticion(`/clientes/${cliente.id}/compras/${idEnCurso.id}`, { token: tokenCajero })).estado, 404);
  assert.equal((await peticion(`/ventas/${venta.insertId}`, { token: tokenCajero })).estado, 403);
  assert.equal((await peticion('/ventas', { token: tokenCajero })).estado, 403);
});

// ---------------------------------------------------------------------------
// Abonos (RF-10 a RF-15)
// ---------------------------------------------------------------------------

test('un abono con monto o método inválido se rechaza diciendo qué corregir, sin registrar nada (RF-10)', async () => {
  const cliente = await clienteConDeuda(10000, 'Abono inválido');
  const cuerpos = [
    {}, { monto: 1000 }, { metodo_pago: 'efectivo' },
    { monto: 0, metodo_pago: 'efectivo' }, { monto: -500, metodo_pago: 'efectivo' },
    { monto: 1500.5, metodo_pago: 'efectivo' }, { monto: 'abc', metodo_pago: 'efectivo' },
    { monto: 100_000_000, metodo_pago: 'efectivo' },
    { monto: 1000, metodo_pago: 'fiado' }, { monto: 1000, metodo_pago: 'cheque' },
    { monto: 1000, metodo_pago: 'efectivo', observacion: 'a'.repeat(256) },
  ];
  for (const cuerpo of cuerpos) {
    const r = await abonar(cliente.id, cuerpo);
    assert.equal(r.estado, 400, JSON.stringify(cuerpo));
    assert.ok(r.datos.mensaje.length > 5);
  }
  assert.equal(await saldoDe(cliente.id), 10000);
  assert.equal((await abonar(cliente.id, { monto: 1000, metodo_pago: 'efectivo' }, null)).estado, 401);
  assert.equal((await abonar(999999, { monto: 1000, metodo_pago: 'efectivo' })).estado, 404);
});

test('el cajero registra un abono: baja la deuda y queda con quién, cuándo, método y observación (RF-10, RF-13)', async () => {
  const cliente = await clienteConDeuda(10000, 'Abono normal');

  const r = await abonar(cliente.id, { monto: 4000, metodo_pago: 'debito', observacion: '  Pagó   con tarjeta ' });
  assert.equal(r.estado, 201);
  assert.deepEqual([r.datos.saldo_anterior, r.datos.saldo_nuevo, r.datos.estado], [10000, 6000, 'deuda']);
  assert.deepEqual([r.datos.abono.monto, r.datos.abono.metodo_pago, r.datos.abono.observacion], [4000, 'debito', 'Pagó con tarjeta']);

  const [[fila]] = await pool.query('SELECT * FROM fiado_transacciones WHERE id = ?', [r.datos.abono.id]);
  assert.deepEqual([fila.tipo, Number(fila.monto), fila.metodo_pago, fila.usuario_id, fila.venta_id, fila.abono_anulado_id],
    ['abono', 4000, 'debito', idCajero, null, null]);
  assert.ok(fila.fecha);
  assert.equal(await saldoDe(cliente.id), 6000);

  // El administrador también puede, y pagar justo la deuda deja al cliente al día
  const total = await abonar(cliente.id, { monto: 6000, metodo_pago: 'efectivo' }, tokenAdmin);
  assert.deepEqual([total.estado, total.datos.saldo_nuevo, total.datos.estado], [201, 0, 'al_dia']);
});

test('un abono mayor que la deuda pide confirmación y, confirmado, deja saldo a favor; también con el cliente al día (RF-12)', async () => {
  const cliente = await clienteConDeuda(10000, 'Abono de más');

  const sinConfirmar = await abonar(cliente.id, { monto: 12500, metodo_pago: 'efectivo' });
  assert.equal(sinConfirmar.estado, 409);
  assert.deepEqual([sinConfirmar.datos.codigo, sinConfirmar.datos.saldo, sinConfirmar.datos.quedaAFavor], ['ABONO_SUPERA_DEUDA', 10000, 2500]);
  assert.match(sinConfirmar.datos.mensaje, /\$2\.500 a favor/);
  assert.equal(await saldoDe(cliente.id), 10000, 'no se registró nada');

  // Solo true confirma
  assert.equal((await abonar(cliente.id, { monto: 12500, metodo_pago: 'efectivo', confirmar_saldo_a_favor: 'si' })).estado, 409);

  const confirmado = await abonar(cliente.id, { monto: 12500, metodo_pago: 'efectivo', confirmar_saldo_a_favor: true });
  assert.deepEqual([confirmado.estado, confirmado.datos.saldo_nuevo, confirmado.datos.estado], [201, -2500, 'a_favor']);

  // Con saldo a favor (o al día) abonar siempre pide confirmación
  const otroAbono = await abonar(cliente.id, { monto: 1000, metodo_pago: 'efectivo' });
  assert.deepEqual([otroAbono.estado, otroAbono.datos.quedaAFavor], [409, 3500]);
  const alDia = await nuevoCliente({ nombre: 'Al día que abona' });
  assert.equal((await abonar(alDia.id, { monto: 1000, metodo_pago: 'efectivo' })).estado, 409);
});

test('si el saldo cambió desde que se mostró, la advertencia se decide con el saldo real (RF-12)', async () => {
  const cliente = await clienteConDeuda(10000, 'Saldo cambiado');
  // La pantalla mostraba 10.000, pero otra persona ya abonó la deuda completa
  await abonar(cliente.id, { monto: 10000, metodo_pago: 'efectivo' });

  const r = await abonar(cliente.id, { monto: 5000, metodo_pago: 'efectivo' });
  assert.equal(r.estado, 409);
  assert.deepEqual([r.datos.codigo, r.datos.saldo, r.datos.quedaAFavor], ['ABONO_SUPERA_DEUDA', 0, 5000]);
  assert.equal(await saldoDe(cliente.id), 0);
});

test('si falla el registro de un abono, la cuenta queda exactamente como estaba (RF-14, RNF-3)', async () => {
  const cliente = await clienteConDeuda(8000, 'Reversa total');
  const [[antes]] = await pool.query('SELECT COUNT(*) AS n FROM fiado_transacciones WHERE cliente_id = ?', [cliente.id]);

  // Una cuenta inexistente rompe la inserción (clave foránea) después de haber evaluado el saldo
  await assert.rejects(clientesModelo.registrarAbono({
    clienteId: cliente.id, usuarioId: 999999, monto: 3000, metodoPago: 'efectivo', hoy: new Date(),
  }));

  const [[despues]] = await pool.query('SELECT COUNT(*) AS n FROM fiado_transacciones WHERE cliente_id = ?', [cliente.id]);
  assert.equal(despues.n, antes.n);
  assert.equal(await saldoDe(cliente.id), 8000);
  // La conexión del pool queda sana: se puede abonar con una cuenta válida
  assert.equal((await abonar(cliente.id, { monto: 3000, metodo_pago: 'efectivo' })).estado, 201);
});

test('dos abonos simultáneos del mismo cliente se registran los dos y el saldo cuadra (RF-13, RNF-3)', async () => {
  const cliente = await clienteConDeuda(10000, 'Abonos simultáneos');

  const [a, b] = await Promise.all([
    abonar(cliente.id, { monto: 3000, metodo_pago: 'efectivo' }),
    abonar(cliente.id, { monto: 2000, metodo_pago: 'transferencia' }, tokenAdmin),
  ]);
  assert.deepEqual([a.estado, b.estado], [201, 201]);
  assert.equal(await saldoDe(cliente.id), 5000);
  // Cada uno vio el saldo real al momento de registrar: el segundo en entrar ve el saldo ya rebajado
  const saldosNuevos = [a.datos.saldo_nuevo, b.datos.saldo_nuevo].sort((x, y) => x - y);
  assert.equal(saldosNuevos[0], 5000);
  assert.ok([7000, 8000].includes(saldosNuevos[1]), `saldos nuevos ${saldosNuevos}`);
});

test('los abonos no se editan ni se borran: no existen rutas para hacerlo (RF-15)', async () => {
  const cliente = await clienteConDeuda(5000, 'Abono inmutable');
  const abono = (await abonar(cliente.id, { monto: 1000, metodo_pago: 'efectivo' })).datos.abono;
  const ruta = `/clientes/${cliente.id}/abonos/${abono.id}`;

  for (const metodo of ['PUT', 'PATCH', 'DELETE']) {
    const r = await peticion(ruta, { metodo, cuerpo: metodo === 'DELETE' ? undefined : { monto: 1 } });
    assert.equal(r.estado, 404, metodo);
  }
  const [[fila]] = await pool.query('SELECT monto FROM fiado_transacciones WHERE id = ?', [abono.id]);
  assert.equal(Number(fila.monto), 1000);
});

// ---------------------------------------------------------------------------
// Anular un abono (RF-16 a RF-19)
// ---------------------------------------------------------------------------

test('el administrador anula un abono con motivo: la deuda sube, el abono sigue visible y queda constancia (RF-16, RF-18)', async () => {
  const cliente = await clienteConDeuda(10000, 'Anular abono');
  const abonoId = (await abonar(cliente.id, { monto: 4000, metodo_pago: 'efectivo' })).datos.abono.id;
  // Sin límite de tiempo: el abono tiene dos años
  await pool.query('UPDATE fiado_transacciones SET fecha = DATE_SUB(NOW(), INTERVAL 2 YEAR) WHERE id = ?', [abonoId]);
  const ruta = `/clientes/${cliente.id}/abonos/${abonoId}/anular`;

  // Sin motivo no se anula
  for (const cuerpo of [{}, { motivo: '' }, { motivo: '   ' }, { motivo: 'a'.repeat(256) }]) {
    assert.equal((await peticion(ruta, { metodo: 'POST', cuerpo })).estado, 400, JSON.stringify(cuerpo).slice(0, 30));
  }
  assert.equal(await saldoDe(cliente.id), 6000);

  const r = await peticion(ruta, { metodo: 'POST', cuerpo: { motivo: '  Se anotó   dos veces ' } });
  assert.equal(r.estado, 200);
  assert.deepEqual([r.datos.saldo_nuevo, r.datos.estado], [10000, 'deuda']);
  assert.equal(await saldoDe(cliente.id), 10000);

  const cuenta = (await peticion(`/clientes/${cliente.id}/cuenta`, { token: tokenCajero })).datos;
  const abono = cuenta.movimientos.find((m) => m.id === abonoId);
  assert.deepEqual([abono.anulado, abono.motivo_anulacion, abono.anulado_por_nombre, abono.monto], [true, 'Se anotó dos veces', 'Dueño', 4000]);
  assert.ok(abono.anulado_en);
  const anulacion = cuenta.movimientos.find((m) => m.tipo === 'anulacion_abono');
  assert.deepEqual([anulacion.monto, anulacion.abono_anulado_id, anulacion.usuario_nombre], [4000, abonoId, 'Dueño']);
  assert.equal(cuenta.cliente.saldo, 10000);
});

test('un abono no se anula dos veces, solo se anulan abonos y solo los del cliente indicado (RF-17)', async () => {
  const cliente = await clienteConDeuda(10000, 'Anulación única');
  const otro = await clienteConDeuda(3000, 'Anulación ajena');
  const abonoId = (await abonar(cliente.id, { monto: 1000, metodo_pago: 'efectivo' })).datos.abono.id;
  const ruta = (id, abono) => `/clientes/${id}/abonos/${abono}/anular`;

  assert.equal((await peticion(ruta(cliente.id, abonoId), { metodo: 'POST', cuerpo: { motivo: 'Uno' } })).estado, 200);
  const segunda = await peticion(ruta(cliente.id, abonoId), { metodo: 'POST', cuerpo: { motivo: 'Dos' } });
  assert.deepEqual([segunda.estado, segunda.datos.codigo], [409, 'ABONO_NO_ANULABLE']);
  assert.match(segunda.datos.mensaje, /ya está anulado/);

  const [[cargo]] = await pool.query("SELECT id FROM fiado_transacciones WHERE cliente_id = ? AND tipo = 'cargo'", [cliente.id]);
  const anularCargo = await peticion(ruta(cliente.id, cargo.id), { metodo: 'POST', cuerpo: { motivo: 'Es un cargo' } });
  assert.deepEqual([anularCargo.estado, anularCargo.datos.codigo], [409, 'ABONO_NO_ANULABLE']);
  assert.match(anularCargo.datos.mensaje, /Solo se pueden anular abonos/);

  assert.equal((await peticion(ruta(otro.id, abonoId), { metodo: 'POST', cuerpo: { motivo: 'Ajeno' } })).estado, 404);
  assert.equal((await peticion(ruta(cliente.id, 999999), { metodo: 'POST', cuerpo: { motivo: 'Nada' } })).estado, 404);
  assert.equal((await peticion(ruta(999999, abonoId), { metodo: 'POST', cuerpo: { motivo: 'Nada' } })).estado, 404);
  assert.equal(await saldoDe(cliente.id), 10000);
});

test('el cajero no puede anular un abono, ni por acceso directo (RF-19)', async () => {
  const cliente = await clienteConDeuda(10000, 'Anula el cajero');
  const abonoId = (await abonar(cliente.id, { monto: 2000, metodo_pago: 'efectivo' })).datos.abono.id;

  const r = await peticion(`/clientes/${cliente.id}/abonos/${abonoId}/anular`, {
    metodo: 'POST', token: tokenCajero, cuerpo: { motivo: 'Quiero deshacerlo' },
  });
  assert.equal(r.estado, 403);
  assert.equal(await saldoDe(cliente.id), 8000);
  const [[anulaciones]] = await pool.query("SELECT COUNT(*) AS n FROM fiado_transacciones WHERE abono_anulado_id = ?", [abonoId]);
  assert.equal(anulaciones.n, 0);
});

test('dos anulaciones simultáneas del mismo abono: una se aplica y la otra se rechaza (RF-17, RNF-3)', async () => {
  const cliente = await clienteConDeuda(10000, 'Anulaciones simultáneas');
  const abonoId = (await abonar(cliente.id, { monto: 3000, metodo_pago: 'efectivo' })).datos.abono.id;
  const ruta = `/clientes/${cliente.id}/abonos/${abonoId}/anular`;

  const resultados = await Promise.all([
    peticion(ruta, { metodo: 'POST', cuerpo: { motivo: 'Primera' } }),
    peticion(ruta, { metodo: 'POST', cuerpo: { motivo: 'Segunda' } }),
  ]);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [200, 409]);
  assert.equal(await saldoDe(cliente.id), 10000);
  const [[anulaciones]] = await pool.query('SELECT COUNT(*) AS n FROM fiado_transacciones WHERE abono_anulado_id = ?', [abonoId]);
  assert.equal(anulaciones.n, 1);
});

// ---------------------------------------------------------------------------
// Datos del cliente y corrección del RUT (RF-20 a RF-25)
// ---------------------------------------------------------------------------

test('se editan nombre, teléfono, correo y dirección, y un texto vacío borra el dato (RF-20)', async () => {
  const cliente = await nuevoCliente();
  const editar = (cuerpo, token = tokenCajero) => peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', token, cuerpo });

  const r = await editar({ nombre: ' Rosa   Soto ', telefono: ' +56 9 1234 5678 ', email: 'rosa@correo.cl', direccion: 'Calle 1' });
  assert.equal(r.estado, 200);
  assert.deepEqual([r.datos.cliente.nombre, r.datos.cliente.telefono, r.datos.cliente.email, r.datos.cliente.direccion],
    ['Rosa Soto', '+56 9 1234 5678', 'rosa@correo.cl', 'Calle 1']);

  // Solo cambia lo enviado; vacío borra
  const parcial = await editar({ email: '', direccion: '   ' });
  assert.deepEqual([parcial.datos.cliente.nombre, parcial.datos.cliente.email, parcial.datos.cliente.direccion], ['Rosa Soto', null, null]);
  assert.equal((await editar({ nombre: '' }, tokenAdmin)).datos.cliente.nombre, null);

  for (const invalido of [{}, { nombre: 'a'.repeat(151) }, { telefono: 'abc' }, { telefono: '1'.repeat(21) },
    { email: 'sin-arroba' }, { email: 'a@b' }, { direccion: 'a'.repeat(201) }, { nombre: 7 }]) {
    assert.equal((await editar(invalido)).estado, 400, JSON.stringify(invalido).slice(0, 40));
  }
  assert.equal((await peticion('/clientes/999999', { metodo: 'PATCH', token: tokenCajero, cuerpo: { nombre: 'x' } })).estado, 404);
  assert.equal((await peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', token: null, cuerpo: { nombre: 'x' } })).estado, 401);

  // El RUT no se cambia por esta ruta
  const rutAntes = cliente.rut;
  await editar({ nombre: 'Otra', rut: rutValido(55555555) });
  assert.equal((await clientesModelo.buscarPorId(cliente.id)).rut, rutAntes);
});

test('al corregir el RUT: inválido, repetido y sin confirmar no cambian nada; confirmado conserva compras, fiados y saldo y deja constancia (RF-21 a RF-24)', async () => {
  const cliente = await clienteConDeuda(9000, 'Cambia de RUT');
  const ventaId = (await peticion(`/clientes/${cliente.id}/cuenta`)).datos.compras[0].id;
  await abonar(cliente.id, { monto: 2000, metodo_pago: 'efectivo' });
  const otro = await nuevoCliente({ nombre: 'Dueño del otro RUT' });
  const rutNuevo = rutValido(66000001);
  const cambiar = (cuerpo, token = tokenCajero) => peticion(`/clientes/${cliente.id}/rut`, { metodo: 'PATCH', token, cuerpo });

  // Inválido
  for (const rut of ['11.111.111-0', 'abc', '', undefined]) {
    const r = await cambiar({ rut, confirmar: true });
    assert.deepEqual([r.estado, r.datos.codigo], [400, 'RUT_INVALIDO'], String(rut));
  }
  // El mismo RUT
  assert.equal((await cambiar({ rut: cliente.rut, confirmar: true })).datos.codigo, 'RUT_SIN_CAMBIOS');
  // Repetido (aunque se escriba con puntos): se indica quién es y no se fusiona
  const [cuerpoOtro, dvOtro] = otro.rut.split('-');
  const repetido = await cambiar({ rut: `${cuerpoOtro.slice(0, 2)}.${cuerpoOtro.slice(2, 5)}.${cuerpoOtro.slice(5)}-${dvOtro}`, confirmar: true });
  assert.deepEqual([repetido.estado, repetido.datos.codigo, repetido.datos.cliente.id, repetido.datos.cliente.nombre],
    [409, 'RUT_REPETIDO', otro.id, 'Dueño del otro RUT']);
  assert.match(repetido.datos.mensaje, /Dueño del otro RUT/);
  // Sin confirmar: avisa qué pasa con las compras y el saldo
  const aviso = await cambiar({ rut: rutNuevo });
  assert.deepEqual([aviso.estado, aviso.datos.codigo, aviso.datos.compras, aviso.datos.saldo], [409, 'CONFIRMACION_REQUERIDA', 1, 7000]);
  assert.match(aviso.datos.mensaje, /compras.*fiados.*saldo/i);
  assert.equal((await clientesModelo.buscarPorId(cliente.id)).rut, cliente.rut);
  const [[sinConstancia]] = await pool.query('SELECT COUNT(*) AS n FROM cambios_rut WHERE cliente_id = ?', [cliente.id]);
  assert.equal(sinConstancia.n, 0);

  // Confirmado
  const ok = await cambiar({ rut: rutNuevo, confirmar: true });
  assert.equal(ok.estado, 200);
  assert.equal(ok.datos.cliente.rut, rutNuevo);
  assert.equal(ok.datos.cliente.saldo, 7000);
  const cuenta = (await peticion(`/clientes/${cliente.id}/cuenta`)).datos;
  assert.deepEqual([cuenta.compras.length, cuenta.compras[0].id, cuenta.movimientos.length, cuenta.cliente.saldo], [1, ventaId, 2, 7000]);
  assert.equal(await saldoDe(cliente.id), 7000);
  assert.equal((await peticion(`/clientes/rut/${rutNuevo}`, { token: tokenCajero })).datos.id, cliente.id);
  assert.equal((await peticion(`/clientes/rut/${cliente.rut}`, { token: tokenCajero })).estado, 404);

  // La constancia: RUT anterior y nuevo, quién y cuándo; solo la ve el administrador
  assert.equal(cuenta.cambios_rut.length, 1);
  const cambio = cuenta.cambios_rut[0];
  assert.deepEqual([cambio.rut_anterior, cambio.rut_nuevo, cambio.usuario_nombre], [cliente.rut, rutNuevo, 'Camila']);
  assert.ok(cambio.creado_en);
  assert.equal('cambios_rut' in (await peticion(`/clientes/${cliente.id}/cuenta`, { token: tokenCajero })).datos, false);

  // Se puede volver a corregir y cada cambio queda registrado, del más reciente al más antiguo
  await cambiar({ rut: rutValido(66000002), confirmar: true }, tokenAdmin);
  const historial = (await peticion(`/clientes/${cliente.id}/cuenta`)).datos.cambios_rut;
  assert.deepEqual(historial.map((c) => [c.rut_anterior, c.rut_nuevo, c.usuario_nombre]),
    [[rutNuevo, rutValido(66000002), 'Dueño'], [cliente.rut, rutNuevo, 'Camila']]);
  assert.equal((await cambiar({ rut: rutValido(66000003), confirmar: true }, null)).estado, 401);
  assert.equal((await peticion('/clientes/999999/rut', { metodo: 'PATCH', token: tokenCajero, cuerpo: { rut: rutNuevo, confirmar: true } })).estado, 404);
});

test('dos correcciones simultáneas al mismo RUT nuevo: solo una se aplica (RF-22, RNF-3)', async () => {
  const a = await nuevoCliente({ nombre: 'Carrera A' });
  const b = await nuevoCliente({ nombre: 'Carrera B' });
  const rut = rutValido(66000100);

  const resultados = await Promise.all([a, b].map((cliente) => peticion(`/clientes/${cliente.id}/rut`, {
    metodo: 'PATCH', token: tokenCajero, cuerpo: { rut, confirmar: true },
  })));
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [200, 409]);
  const perdedor = resultados.find((r) => r.estado === 409);
  assert.equal(perdedor.datos.codigo, 'RUT_REPETIDO');
  const [[total]] = await pool.query('SELECT COUNT(*) AS n FROM clientes WHERE rut = ?', [rut]);
  assert.equal(total.n, 1);
});

test('corregir el RUT de un cliente con una venta en curso no desvincula la venta (caso límite)', async () => {
  const cliente = await nuevoCliente({ nombre: 'Venta en curso al cambiar RUT' });
  const cajero = await nuevoCajero();
  const inicio = await peticion('/ventas/iniciar', { metodo: 'POST', token: cajero.token });
  const ventaId = inicio.datos.venta.id;
  await pool.query('UPDATE ventas SET cliente_id = ? WHERE id = ?', [cliente.id, ventaId]);

  const r = await peticion(`/clientes/${cliente.id}/rut`, {
    metodo: 'PATCH', token: cajero.token, cuerpo: { rut: rutValido(66000200), confirmar: true },
  });
  assert.equal(r.estado, 200);
  const [[venta]] = await pool.query('SELECT cliente_id, estado FROM ventas WHERE id = ?', [ventaId]);
  assert.deepEqual([venta.cliente_id, venta.estado], [cliente.id, 'en_curso']);
});

// ---------------------------------------------------------------------------
// Saldo, trazabilidad y permisos (RF-26, RF-27, RNF-3, RNF-4, RNF-5, RNF-8)
// ---------------------------------------------------------------------------

test('tras cualquier mezcla de ventas fiadas, abonos y anulaciones, el saldo es la suma con signo de los movimientos (RF-26, RNF-3)', async () => {
  const cliente = await clienteConDeuda(12000, 'Conciliación');
  const ventaAnulable = await cargarDeuda(cliente.id, 8000);
  await abonar(cliente.id, { monto: 5000, metodo_pago: 'efectivo' });
  const mal = (await abonar(cliente.id, { monto: 3000, metodo_pago: 'debito' })).datos.abono.id;
  await peticion(`/clientes/${cliente.id}/abonos/${mal}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Error' } });
  await abonar(cliente.id, { monto: 1000, metodo_pago: 'credito' });
  // Anulación de la venta fiada (spec 003): descuenta su cargo
  const anulacion = await peticion(`/ventas/${ventaAnulable}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Venta mal hecha' } });
  assert.equal(anulacion.estado, 200, JSON.stringify(anulacion.datos));
  // Un abono de más que deja saldo a favor y luego se anula
  const demas = (await abonar(cliente.id, { monto: 50000, metodo_pago: 'transferencia', confirmar_saldo_a_favor: true })).datos.abono.id;
  await peticion(`/clientes/${cliente.id}/abonos/${demas}/anular`, { metodo: 'POST', cuerpo: { motivo: 'Era otro cliente' } });

  const [movimientos] = await pool.query('SELECT tipo, monto FROM fiado_transacciones WHERE cliente_id = ?', [cliente.id]);
  const esperado = calcularSaldo(movimientos);
  assert.equal(await saldoDe(cliente.id), esperado);
  assert.equal((await peticion(`/clientes/${cliente.id}/cuenta`)).datos.cliente.saldo, esperado);
  assert.equal((await peticion(`/clientes/rut/${cliente.rut}`, { token: tokenCajero })).datos.saldo, esperado);
  // 12.000 + 8.000 − 5.000 − 3.000 + 3.000 − 1.000 − 8.000 − 50.000 + 50.000
  assert.equal(esperado, 6000);

  // La regla del principio 5 se cumple para todos los clientes de la base
  const [clientes] = await pool.query('SELECT cliente_id, saldo_fiado FROM v_saldo_fiado');
  for (const fila of clientes) {
    const [filas] = await pool.query('SELECT tipo, monto FROM fiado_transacciones WHERE cliente_id = ?', [fila.cliente_id]);
    assert.equal(Number(fila.saldo_fiado), calcularSaldo(filas), `cliente ${fila.cliente_id}`);
  }
});

test('los movimientos conservan quién los registró aunque esa cuenta se desactive (RF-27)', async () => {
  const cliente = await clienteConDeuda(6000, 'Cuenta desactivada después');
  const cajero = await nuevoCajero();
  const abonoId = (await abonar(cliente.id, { monto: 1500, metodo_pago: 'efectivo' }, cajero.token)).datos.abono.id;

  await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [cajero.id]);
  const cuenta = (await peticion(`/clientes/${cliente.id}/cuenta`)).datos;
  const abono = cuenta.movimientos.find((m) => m.id === abonoId);
  assert.match(abono.usuario_nombre, /^Cajero \d+$/);
  const [[fila]] = await pool.query('SELECT usuario_id FROM fiado_transacciones WHERE id = ?', [abonoId]);
  assert.equal(fila.usuario_id, cajero.id);
});

test('un cajero desactivado con venta en curso solo puede terminarla: no ve cuentas, ni abona, ni edita clientes (spec 001; caso límite)', async () => {
  const cliente = await clienteConDeuda(5000, 'Cajero desactivado');
  const cajero = await nuevoCajero();
  const [producto] = await pool.query(
    "INSERT INTO productos (nombre, precio_venta, precio_costo, stock, categoria_id) VALUES ('Producto del desactivado', 1000, 600, 10, 1)"
  );
  const ventaId = (await peticion('/ventas/iniciar', { metodo: 'POST', token: cajero.token })).datos.venta.id;
  await peticion(`/ventas/${ventaId}/lineas`, { metodo: 'POST', token: cajero.token, cuerpo: { producto_id: producto.insertId, cantidad: 1 } });
  await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [cajero.id]);

  const con = (ruta, metodo = 'GET', cuerpo) => peticion(ruta, { metodo, token: cajero.token, cuerpo });
  assert.equal((await con(`/clientes/${cliente.id}/cuenta`)).estado, 403);
  assert.equal((await con(`/clientes/${cliente.id}/compras/1`)).estado, 403);
  assert.equal((await con('/clientes')).estado, 403);
  assert.equal((await con(`/clientes/${cliente.id}/abonos`, 'POST', { monto: 1000, metodo_pago: 'efectivo' })).estado, 403);
  assert.equal((await con(`/clientes/${cliente.id}`, 'PATCH', { nombre: 'Cambiado' })).estado, 403);
  assert.equal((await con(`/clientes/${cliente.id}/rut`, 'PATCH', { rut: rutValido(66000300), confirmar: true })).estado, 403);
  assert.equal(await saldoDe(cliente.id), 5000);

  // Sí puede buscar al cliente y terminar su venta
  assert.equal((await con(`/clientes/rut/${cliente.rut}`)).estado, 200);
  const cobro = await con(`/ventas/${ventaId}/confirmar`, 'POST', { metodo_pago: 'fiado', cliente_id: cliente.id });
  assert.equal(cobro.estado, 200, JSON.stringify(cobro.datos));
  assert.equal(await saldoDe(cliente.id), 6000);
});

test('los textos están en español y los montos son pesos enteros; el costo no viaja en ninguna respuesta del cajero (RNF-4, RNF-5, RNF-8)', async () => {
  const cliente = await clienteConDeuda(15000, 'Formato y precios');
  const abono = await abonar(cliente.id, { monto: 2500, metodo_pago: 'efectivo' });
  const mensajes = [
    abono.datos.mensaje,
    (await abonar(cliente.id, { monto: 0, metodo_pago: 'efectivo' })).datos.mensaje,
    (await abonar(cliente.id, { monto: 100, metodo_pago: 'cheque' })).datos.mensaje,
    (await abonar(cliente.id, { monto: 90000, metodo_pago: 'efectivo' })).datos.mensaje,
    (await peticion(`/clientes/${cliente.id}/abonos/9999/anular`, { metodo: 'POST', cuerpo: { motivo: 'x' } })).datos.mensaje,
    (await peticion(`/clientes/${cliente.id}`, { metodo: 'PATCH', token: tokenCajero, cuerpo: {} })).datos.mensaje,
    (await peticion('/clientes?estado=moroso', { token: tokenCajero })).datos.mensaje,
  ];
  for (const mensaje of mensajes) {
    assert.ok(mensaje && !/\b(invalid|error|not found|required|forbidden|missing)\b/i.test(mensaje), `mensaje: ${mensaje}`);
  }
  assert.match(mensajes[1], /mayor que \$0/);
  assert.match(mensajes[3], /\$77\.500 a favor/); // deuda 15.000 − abono 2.500 = 12.500; abonar 90.000 deja 77.500

  const cuenta = (await peticion(`/clientes/${cliente.id}/cuenta`, { token: tokenCajero })).datos;
  assert.ok([cuenta.cliente.saldo, ...cuenta.movimientos.map((m) => m.monto), ...cuenta.compras.map((c) => c.total)].every(Number.isInteger));

  for (const ruta of ['/clientes', `/clientes/${cliente.id}/cuenta`, `/clientes/rut/${cliente.rut}`]) {
    const texto = JSON.stringify((await peticion(ruta, { token: tokenCajero })).datos).toLowerCase();
    assert.equal(/costo|margen/.test(texto), false, ruta);
  }
});
