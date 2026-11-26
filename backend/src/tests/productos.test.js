// Pruebas de integración de la spec 002 (productos e inventario) contra MySQL.
// Se ejecutan aparte: npm run test:integracion
// Usan su propia base (almacenpro_test_inventario) para no chocar con las pruebas de la
// spec 001, que node --test ejecuta en paralelo, ni tocar la base real.
process.env.DB_NAME = process.env.DB_NAME ?? 'almacenpro_test_inventario';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-pruebas-spec002';

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
const productosModelo = await import('../models/productos.model.js');
const { emitirToken } = await import('../services/credenciales.js');

const directorio = path.dirname(fileURLToPath(import.meta.url));
const rutaEsquema = path.resolve(directorio, '../../database/schema.sql');

let servidor;
let tokenAdmin;
let tokenCajero;
let idAdmin;
let contador = 0;

function url(ruta) {
  return `http://127.0.0.1:${servidor.address().port}/api/productos${ruta}`;
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

function cuerpoProducto(cambios = {}) {
  contador += 1;
  return {
    nombre: `Producto ${contador}`,
    categoria_id: 3,
    unidad_medida: 'unidad',
    precio_venta: 1290,
    precio_costo: 950,
    stock_minimo: 5,
    stock: 10,
    ...cambios,
  };
}

async function crearProducto(cambios = {}) {
  const respuesta = await peticion('', { metodo: 'POST', cuerpo: cuerpoProducto(cambios) });
  assert.equal(respuesta.estado, 201, JSON.stringify(respuesta.datos));
  return respuesta.datos.id;
}

async function leer(id, token = tokenAdmin) {
  const { datos } = await peticion('', { token });
  return datos.find((producto) => producto.id === id);
}

async function movimientos(id) {
  return (await peticion(`/${id}/movimientos`)).datos;
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
  const idCajero = await usuariosModelo.crear({
    nombre: 'Caja', usuario: 'caja', passwordHash: 'no-se-usa', rol: 'cajero',
  });
  tokenAdmin = emitirToken(await usuariosModelo.buscarPorId(idAdmin));
  tokenCajero = emitirToken(await usuariosModelo.buscarPorId(idCajero));

  servidor = app.listen(0);
});

after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  await pool.end();
});

test('se crean productos por unidad y por kilo, con y sin código, y aparecen en el listado (RF-1, RF-6, RF-7, RF-17)', async () => {
  const idUnidad = await crearProducto({ nombre: 'Leche', codigo_barras: '7801000000001' });
  const idKilo = await crearProducto({
    nombre: 'Queso', unidad_medida: 'kilo', stock: 2.5, stock_minimo: 0.5,
  });

  const unidad = await leer(idUnidad);
  const kilo = await leer(idKilo);
  assert.equal(unidad.codigo_barras, '7801000000001');
  assert.equal(kilo.codigo_barras, null);
  assert.equal(kilo.stock, 2.5);
  assert.equal(kilo.unidad_medida, 'kilo');
  assert.equal(typeof kilo.precio_venta, 'number');
});

test('los datos inválidos se rechazan con 400 y mensajes en español (RF-2, RF-3, RNF-5)', async () => {
  const casos = [
    [{ nombre: '   ' }, /nombre/],
    [{ precio_venta: 0 }, /precio de venta/],
    [{ precio_venta: 1290.5 }, /precio de venta/],
    [{ precio_costo: -1 }, /costo/],
    [{ categoria_id: undefined }, /categoría/],
    [{ categoria_id: 9999 }, /categoría/],
    [{ unidad_medida: 'litro' }, /unidad o por kilo/],
    [{ stock: 2.5 }, /stock inicial/],
  ];
  for (const [cambios, esperado] of casos) {
    const respuesta = await peticion('', { metodo: 'POST', cuerpo: cuerpoProducto(cambios) });
    assert.equal(respuesta.estado, 400, JSON.stringify(cambios));
    assert.match(respuesta.datos.mensaje, esperado);
  }
});

test('un precio menor al costo exige confirmar y con confirmación se guarda (RF-4)', async () => {
  const cuerpo = cuerpoProducto({ precio_venta: 900 });
  const sinConfirmar = await peticion('', { metodo: 'POST', cuerpo });
  assert.equal(sinConfirmar.estado, 409);
  assert.equal(sinConfirmar.datos.codigo, 'VENTA_CON_PERDIDA');

  const confirmado = await peticion('', { metodo: 'POST', cuerpo: { ...cuerpo, confirmarPerdida: true } });
  assert.equal(confirmado.estado, 201);

  // Precio igual al costo no es pérdida.
  const igual = await peticion('', { metodo: 'POST', cuerpo: cuerpoProducto({ precio_venta: 950 }) });
  assert.equal(igual.estado, 201);
});

test('un código de barras repetido se rechaza, incluso si el otro producto está desactivado (RF-5)', async () => {
  const id = await crearProducto({ nombre: 'Atún', codigo_barras: '7802000000002' });
  const repetido = await peticion('', {
    metodo: 'POST', cuerpo: cuerpoProducto({ codigo_barras: '7802000000002' }),
  });
  assert.equal(repetido.estado, 409);
  assert.match(repetido.datos.mensaje, /Atún/);

  await peticion(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });
  const contraDesactivado = await peticion('', {
    metodo: 'POST', cuerpo: cuerpoProducto({ codigo_barras: '7802000000002' }),
  });
  assert.equal(contraDesactivado.estado, 409);
});

test('un nombre repetido solo avisa y no bloquea (RF-6)', async () => {
  await crearProducto({ nombre: 'Pan de molde' });
  const respuesta = await peticion('', { metodo: 'POST', cuerpo: cuerpoProducto({ nombre: 'pan de molde' }) });
  assert.equal(respuesta.estado, 201);
  assert.deepEqual(respuesta.datos.avisos, ['Ya existe un producto con ese nombre']);
});

test('el stock inicial deja un movimiento y con stock 0 no deja ninguno (RF-8)', async () => {
  const conStock = await crearProducto({ stock: 12 });
  const sinStock = await crearProducto({ stock: 0 });

  const historial = await movimientos(conStock);
  assert.equal(historial.length, 1);
  assert.equal(historial[0].tipo, 'stock_inicial');
  assert.equal(historial[0].cantidad, 12);
  assert.equal(historial[0].stock_antes, 0);
  assert.equal(historial[0].stock_despues, 12);
  assert.equal(historial[0].usuario, 'admin');
  assert.equal((await movimientos(sinStock)).length, 0);
});

test('editar cambia los datos y enviar stock o activo no los modifica (RF-9, RF-10)', async () => {
  const id = await crearProducto({ nombre: 'Aceite', stock: 8 });
  const edicion = await peticion(`/${id}`, {
    metodo: 'PUT',
    cuerpo: cuerpoProducto({
      nombre: 'Aceite 1 L', precio_venta: 2500, precio_costo: 1800, stock_minimo: 3,
      stock: 9999, activo: 0,
    }),
  });
  assert.equal(edicion.estado, 200);

  const producto = await leer(id);
  assert.equal(producto.nombre, 'Aceite 1 L');
  assert.equal(producto.precio_venta, 2500);
  assert.equal(producto.precio_costo, 1800);
  assert.equal(producto.stock_minimo, 3);
  assert.equal(producto.stock, 8);
  assert.equal(producto.activo, 1);

  assert.equal((await peticion('/9999', { metodo: 'PUT', cuerpo: cuerpoProducto() })).estado, 404);
});

test('cambiar el precio no altera el precio congelado en una venta existente (RF-11)', async () => {
  const id = await crearProducto({ nombre: 'Galletas', precio_venta: 1290, stock: 20 });
  const [venta] = await pool.query(
    "INSERT INTO ventas (usuario_id, total, metodo_pago, estado) VALUES (?, 1290, 'efectivo', 'completada')",
    [idAdmin]
  );
  await pool.query(
    'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, 1, 1290, 1290)',
    [venta.insertId, id]
  );

  const edicion = await peticion(`/${id}`, {
    metodo: 'PUT', cuerpo: cuerpoProducto({ nombre: 'Galletas', precio_venta: 1790 }),
  });
  assert.equal(edicion.estado, 200);
  assert.equal((await leer(id)).precio_venta, 1790);

  const [detalle] = await pool.query('SELECT precio_unitario FROM detalle_ventas WHERE producto_id = ?', [id]);
  assert.equal(Number(detalle[0].precio_unitario), 1290);
});

test('la unidad no se puede cambiar con movimientos, pero sí sin historia (RF-12)', async () => {
  const conHistoria = await crearProducto({ stock: 5 });
  const bloqueado = await peticion(`/${conHistoria}`, {
    metodo: 'PUT', cuerpo: cuerpoProducto({ unidad_medida: 'kilo' }),
  });
  assert.equal(bloqueado.estado, 409);
  assert.match(bloqueado.datos.mensaje, /unidad/);

  const sinHistoria = await crearProducto({ stock: 0 });
  const permitido = await peticion(`/${sinHistoria}`, {
    metodo: 'PUT', cuerpo: cuerpoProducto({ unidad_medida: 'kilo', stock_minimo: 1.5 }),
  });
  assert.equal(permitido.estado, 200);
  assert.equal((await leer(sinHistoria)).unidad_medida, 'kilo');
});

test('desactivar conserva stock e historial, aparece como desactivado y reactivar lo devuelve (RF-13, RF-14)', async () => {
  const id = await crearProducto({ nombre: 'Yogur', stock: 7 });

  const desactivar = await peticion(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });
  assert.equal(desactivar.estado, 200);
  const desactivado = await leer(id);
  assert.equal(desactivado.activo, 0);
  assert.equal(desactivado.stock, 7);
  assert.equal(desactivado.estado_stock, 'sin_alerta');
  assert.equal((await movimientos(id)).length, 1);

  // No queda entre los productos vendibles.
  const vendibles = await productosModelo.listarVendibles();
  assert.ok(!vendibles.some((producto) => producto.id === id));

  await peticion(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo: true } });
  assert.equal((await leer(id)).activo, 1);
  assert.ok((await productosModelo.listarVendibles()).some((producto) => producto.id === id));

  assert.equal((await peticion(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo: 'si' } })).estado, 400);
  assert.equal((await peticion('/9999/estado', { metodo: 'PATCH', cuerpo: { activo: true } })).estado, 404);
});

test('no existe forma de eliminar un producto (RF-15)', async () => {
  const id = await crearProducto();
  const respuesta = await peticion(`/${id}`, { metodo: 'DELETE' });
  assert.equal(respuesta.estado, 404);
  assert.ok(await leer(id));
});

test('un producto previo sin categoría se lista sin categoría (RF-16)', async () => {
  const [resultado] = await pool.query(
    "INSERT INTO productos (nombre, precio_venta, categoria_id) VALUES ('Sin categoria previa', 500, NULL)"
  );
  const producto = await leer(resultado.insertId);
  assert.equal(producto.categoria_id, null);
  assert.equal(producto.categoria, null);

  // Al guardarlo de nuevo se exige elegir una categoría.
  const sinCategoria = await peticion(`/${resultado.insertId}`, {
    metodo: 'PUT', cuerpo: cuerpoProducto({ nombre: 'Sin categoria previa', categoria_id: undefined }),
  });
  assert.equal(sinCategoria.estado, 400);
});

test('ambos roles ven el mismo listado; el cajero no recibe el costo y ve los desactivados (RF-17, RF-19, RF-20, RNF-6)', async () => {
  const id = await crearProducto({ nombre: 'Visible para todos' });
  await peticion(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });

  const admin = (await peticion('', { token: tokenAdmin })).datos;
  const cajero = (await peticion('', { token: tokenCajero })).datos;
  assert.equal(admin.length, cajero.length);
  assert.ok(admin.every((producto) => producto.precio_costo !== undefined));
  assert.ok(cajero.every((producto) => !('precio_costo' in producto)));

  const desactivado = cajero.find((producto) => producto.id === id);
  assert.equal(desactivado.activo, 0);

  // Los activos van primero.
  const primerDesactivado = cajero.findIndex((producto) => producto.activo === 0);
  assert.ok(cajero.slice(primerDesactivado).every((producto) => producto.activo === 0));

  // Ninguna otra ruta que el cajero pueda usar filtra el costo.
  assert.ok(!('precio_costo' in (await peticion('/resumen-stock', { token: tokenCajero })).datos));
});

test('se busca por nombre y código y se filtra por categoría y estado de stock (RF-18)', async () => {
  await crearProducto({ nombre: 'Detergente Brillo', categoria_id: 5, codigo_barras: '7803000000003', stock: 20, stock_minimo: 5 });
  const bajo = await crearProducto({ nombre: 'Detergente Bajo', categoria_id: 5, stock: 3, stock_minimo: 5 });
  const agotado = await crearProducto({ nombre: 'Detergente Agotado', categoria_id: 5, stock: 0, stock_minimo: 5 });

  const porNombre = (await peticion('?buscar=detergente')).datos;
  assert.equal(porNombre.length, 3);
  const porCodigo = (await peticion('?buscar=7803000000003')).datos;
  assert.equal(porCodigo.length, 1);

  const porCategoria = (await peticion('?categoria=5')).datos;
  assert.ok(porCategoria.length >= 3 && porCategoria.every((producto) => producto.categoria_id === 5));

  const soloBajos = (await peticion('?categoria=5&estadoStock=bajo')).datos;
  assert.deepEqual(soloBajos.map((producto) => producto.id), [bajo]);
  const soloAgotados = (await peticion('?categoria=5&estadoStock=agotado')).datos;
  assert.deepEqual(soloAgotados.map((producto) => producto.id), [agotado]);

  assert.equal((await peticion('?estadoStock=otro')).estado, 400);
  assert.equal((await peticion('?categoria=abc')).estado, 400);
});

test('el cajero recibe 403 en crear, editar, estado, ajustes e historial (RF-21)', async () => {
  const id = await crearProducto();
  const intentos = [
    ['POST', '', cuerpoProducto()],
    ['PUT', `/${id}`, cuerpoProducto()],
    ['PATCH', `/${id}/estado`, { activo: false }],
    ['POST', `/${id}/ajustes`, { tipo: 'merma', cantidad: 1 }],
    ['GET', `/${id}/movimientos`, undefined],
  ];
  for (const [metodo, ruta, cuerpo] of intentos) {
    const respuesta = await peticion(ruta, { metodo, token: tokenCajero, cuerpo });
    assert.equal(respuesta.estado, 403, `${metodo} ${ruta}`);
    assert.match(respuesta.datos.mensaje, /permisos/);
  }
  assert.equal((await peticion('', { token: null })).estado, 401);
  assert.equal((await leer(id)).stock, 10);
});

test('merma, reposición y corrección actualizan el stock y dejan su movimiento (RF-22, RF-23, RF-26)', async () => {
  const id = await crearProducto({ stock: 10 });

  const merma = await peticion(`/${id}/ajustes`, {
    metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 3, nota: '  se cayó la caja ' },
  });
  assert.equal(merma.estado, 200);
  assert.equal(merma.datos.stock, 7);

  const reposicion = await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'reposicion', cantidad: 5 } });
  assert.equal(reposicion.datos.stock, 12);

  const correccion = await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'correccion', cantidad: 9 } });
  assert.equal(correccion.datos.stock, 9);
  assert.equal(correccion.datos.diferencia, -3);
  assert.equal((await leer(id)).stock, 9);

  const historial = await movimientos(id);
  assert.deepEqual(historial.map((m) => m.tipo), ['correccion', 'reposicion', 'merma', 'stock_inicial']);
  const registroMerma = historial.find((m) => m.tipo === 'merma');
  assert.equal(registroMerma.cantidad, -3);
  assert.equal(registroMerma.stock_antes, 10);
  assert.equal(registroMerma.stock_despues, 7);
  assert.equal(registroMerma.nota, 'se cayó la caja');
  assert.equal(registroMerma.usuario, 'admin');
  assert.ok(registroMerma.creado_en);
});

test('los ajustes inválidos se rechazan sin modificar nada (RF-24, RF-25)', async () => {
  const id = await crearProducto({ stock: 10 });
  const ajustar = (cuerpo) => peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo });

  assert.equal((await ajustar({ tipo: 'regalo', cantidad: 1 })).estado, 400);
  assert.equal((await ajustar({ tipo: 'merma', cantidad: 0 })).estado, 400);
  assert.equal((await ajustar({ tipo: 'merma', cantidad: -2 })).estado, 400);
  assert.equal((await ajustar({ tipo: 'merma', cantidad: 1.5 })).estado, 400);
  assert.equal((await ajustar({ tipo: 'merma', cantidad: 'abc' })).estado, 400);

  const excesiva = await ajustar({ tipo: 'merma', cantidad: 11 });
  assert.equal(excesiva.estado, 409);
  assert.equal(excesiva.datos.stockActual, 10);
  assert.match(excesiva.datos.mensaje, /10/);

  assert.equal((await leer(id)).stock, 10);
  assert.equal((await movimientos(id)).length, 1);

  // La corrección a 0 sí es válida.
  const aCero = await ajustar({ tipo: 'correccion', cantidad: 0 });
  assert.equal(aCero.estado, 200);
  assert.equal(aCero.datos.estado_stock, 'agotado');

  assert.equal((await peticion('/9999/ajustes', { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 1 } })).estado, 404);
});

test('los kilos admiten hasta 3 decimales y suman sin error de redondeo (RF-7, RNF-1)', async () => {
  const id = await crearProducto({ unidad_medida: 'kilo', stock: 0.1, stock_minimo: 0.5 });
  const suma = await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'reposicion', cantidad: 0.2 } });
  assert.equal(suma.datos.stock, 0.3);
  const demasiados = await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'reposicion', cantidad: 0.1234 } });
  assert.equal(demasiados.estado, 400);
});

test('se puede ajustar el stock de un producto desactivado (RF-30)', async () => {
  const id = await crearProducto({ stock: 6 });
  await peticion(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });
  const merma = await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 2 } });
  assert.equal(merma.estado, 200);
  assert.equal((await leer(id)).stock, 4);
});

test('dos mermas simultáneas no dejan stock negativo: una se aplica y la otra se rechaza (RF-27, RNF-1)', async () => {
  const id = await crearProducto({ stock: 10 });
  const ajustes = await Promise.all([
    peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 6 } }),
    peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 6 } }),
  ]);

  assert.deepEqual(ajustes.map((a) => a.estado).sort(), [200, 409]);
  assert.equal((await leer(id)).stock, 4);
  assert.equal((await movimientos(id)).length, 2); // stock inicial + una sola merma
});

test('la base rechaza un stock negativo aunque falle la validación de la aplicación (RNF-1)', async () => {
  const id = await crearProducto({ stock: 3 });
  await assert.rejects(
    pool.query('UPDATE productos SET stock = -1 WHERE id = ?', [id]),
    { code: 'ER_CHECK_CONSTRAINT_VIOLATED' }
  );
  assert.equal((await leer(id)).stock, 3);
});

test('si falla el registro del movimiento, el stock no cambia (RNF-2)', async () => {
  const id = await crearProducto({ stock: 10 });
  // Un usuario inexistente rompe la clave foránea del movimiento, después de actualizar el stock.
  await assert.rejects(productosModelo.ajustarStock({
    productoId: id, usuarioId: 999999, tipo: 'merma', cantidad: 4, nota: null, hoy: new Date(),
  }));
  assert.equal((await leer(id)).stock, 10);
  assert.equal((await movimientos(id)).length, 1);
});

test('el historial va del más reciente al más antiguo y no tiene rutas para modificarlo (RF-28, RF-29, RNF-7)', async () => {
  const id = await crearProducto({ stock: 5 });
  await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'reposicion', cantidad: 1 } });
  await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 2 } });

  const historial = await movimientos(id);
  assert.deepEqual(historial.map((m) => m.tipo), ['merma', 'reposicion', 'stock_inicial']);
  assert.equal((await peticion('/9999/movimientos')).estado, 404);

  for (const metodo of ['PUT', 'PATCH', 'DELETE', 'POST']) {
    const respuesta = await peticion(`/${id}/movimientos`, { metodo, cuerpo: { tipo: 'merma' } });
    assert.equal(respuesta.estado, 404, metodo);
    const respuestaDetalle = await peticion(`/${id}/movimientos/1`, { metodo, cuerpo: {} });
    assert.equal(respuestaDetalle.estado, 404, metodo);
  }
  assert.equal((await movimientos(id)).length, 3);
});

test('el estado de stock se recalcula en cada lectura al ajustar o cambiar el mínimo (RF-31, RF-32, RF-34)', async () => {
  const id = await crearProducto({ stock: 10, stock_minimo: 5 });
  assert.equal((await leer(id)).estado_stock, 'normal');

  await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'merma', cantidad: 5 } });
  assert.equal((await leer(id)).estado_stock, 'bajo'); // stock igual al mínimo

  await peticion(`/${id}`, { metodo: 'PUT', cuerpo: cuerpoProducto({ stock_minimo: 2 }) });
  assert.equal((await leer(id)).estado_stock, 'normal');

  await peticion(`/${id}`, { metodo: 'PUT', cuerpo: cuerpoProducto({ stock_minimo: 0 }) });
  await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'correccion', cantidad: 0 } });
  assert.equal((await leer(id)).estado_stock, 'agotado'); // agotado aunque el mínimo sea 0

  await peticion(`/${id}/ajustes`, { metodo: 'POST', cuerpo: { tipo: 'reposicion', cantidad: 4 } });
  assert.equal((await leer(id)).estado_stock, 'normal'); // mínimo 0: nunca "bajo"
});

test('el resumen cuenta solo productos activos y es igual para ambos roles (RF-33, RF-34)', async () => {
  const antes = (await peticion('/resumen-stock')).datos;
  const bajo = await crearProducto({ stock: 1, stock_minimo: 5 });
  await crearProducto({ stock: 0, stock_minimo: 5 });

  const conAlertas = (await peticion('/resumen-stock')).datos;
  assert.equal(conAlertas.stockBajo, antes.stockBajo + 1);
  assert.equal(conAlertas.agotados, antes.agotados + 1);
  assert.deepEqual((await peticion('/resumen-stock', { token: tokenCajero })).datos, conAlertas);

  // Un producto desactivado deja de contar.
  await peticion(`/${bajo}/estado`, { metodo: 'PATCH', cuerpo: { activo: false } });
  const sinElBajo = (await peticion('/resumen-stock')).datos;
  assert.equal(sinElBajo.stockBajo, antes.stockBajo);
  assert.equal(sinElBajo.agotados, antes.agotados + 1);
});

test('las categorías existentes se ofrecen a ambos roles (RF-1, RF-16, RF-18)', async () => {
  const categorias = (await peticion('/categorias', { token: tokenCajero })).datos;
  assert.equal(categorias.length, 8);
  assert.ok(categorias.some((categoria) => categoria.nombre === 'Bebidas'));
});
