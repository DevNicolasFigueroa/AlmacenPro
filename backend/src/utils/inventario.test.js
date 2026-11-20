// Pruebas unitarias de las decisiones puras de la spec 002 (sin base de datos ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cantidadValidaParaUnidad,
  esCodigoBarrasValido,
  esCostoValido,
  esNombreValido,
  esPrecioVentaValido,
  esUnidadValida,
  hayVentaConPerdida,
  normalizarCodigoBarras,
  normalizarNombre,
  puedeCambiarUnidad,
  redondearCantidad,
  validarDatosProducto,
} from './inventario.js';

const datosValidos = {
  nombre: 'Leche entera 1 L',
  categoria_id: 3,
  unidad_medida: 'unidad',
  precio_venta: 1290,
  precio_costo: 950,
};

test('solo se aceptan las unidades "unidad" y "kilo" (RF-1, RF-7)', () => {
  assert.equal(esUnidadValida('unidad'), true);
  assert.equal(esUnidadValida('kilo'), true);
  assert.equal(esUnidadValida('litro'), false);
  assert.equal(esUnidadValida(''), false);
  assert.equal(esUnidadValida(undefined), false);
});

test('el nombre vacío o de solo espacios se rechaza y los espacios se colapsan (RF-2)', () => {
  assert.equal(esNombreValido('   '), false);
  assert.equal(esNombreValido(''), false);
  assert.equal(esNombreValido(null), false);
  assert.equal(esNombreValido('x'.repeat(151)), false);
  assert.equal(esNombreValido('x'.repeat(150)), true);
  assert.equal(normalizarNombre('  Pan   de   molde  '), 'Pan de molde');
});

test('precio de venta entero mayor a 0 y costo entero de 0 o más (RF-3)', () => {
  assert.equal(esPrecioVentaValido(1490), true);
  assert.equal(esPrecioVentaValido('1490'), true);
  assert.equal(esPrecioVentaValido(0), false);
  assert.equal(esPrecioVentaValido(-5), false);
  assert.equal(esPrecioVentaValido(1490.5), false);
  assert.equal(esPrecioVentaValido('abc'), false);
  assert.equal(esPrecioVentaValido(null), false);
  assert.equal(esPrecioVentaValido(1e12), false);

  assert.equal(esCostoValido(0), true);
  assert.equal(esCostoValido(800), true);
  assert.equal(esCostoValido(-1), false);
  assert.equal(esCostoValido(10.2), false);
  assert.equal(esCostoValido(''), false);
});

test('la venta con pérdida solo existe si el precio es menor al costo (RF-4)', () => {
  assert.equal(hayVentaConPerdida(900, 950), true);
  assert.equal(hayVentaConPerdida(950, 950), false);
  assert.equal(hayVentaConPerdida(1290, 950), false);
  assert.equal(hayVentaConPerdida('900', '950'), true);
  assert.equal(hayVentaConPerdida('abc', 950), false);
});

test('un código de barras vacío pasa a null y el largo y los caracteres se validan (RF-5, RF-6)', () => {
  assert.equal(normalizarCodigoBarras('  '), null);
  assert.equal(normalizarCodigoBarras(undefined), null);
  assert.equal(normalizarCodigoBarras(' 7801234567890 '), '7801234567890');

  assert.equal(esCodigoBarrasValido(null), true);
  assert.equal(esCodigoBarrasValido('7801234567890'), true);
  assert.equal(esCodigoBarrasValido('A'.repeat(20)), true);
  assert.equal(esCodigoBarrasValido('A'.repeat(21)), false);
  assert.equal(esCodigoBarrasValido('78 01'), false);
  assert.equal(esCodigoBarrasValido('78-01'), false);
  assert.equal(esCodigoBarrasValido(''), false);
});

test('por unidad solo enteros; por kilo hasta 3 decimales; negativos y NaN fuera (RF-7)', () => {
  assert.equal(cantidadValidaParaUnidad(12, 'unidad'), true);
  assert.equal(cantidadValidaParaUnidad(0, 'unidad'), true);
  assert.equal(cantidadValidaParaUnidad(2.5, 'unidad'), false);

  assert.equal(cantidadValidaParaUnidad(2.5, 'kilo'), true);
  assert.equal(cantidadValidaParaUnidad(0.125, 'kilo'), true);
  assert.equal(cantidadValidaParaUnidad('1.5', 'kilo'), true);
  assert.equal(cantidadValidaParaUnidad(0.1234, 'kilo'), false);

  assert.equal(cantidadValidaParaUnidad(-1, 'unidad'), false);
  assert.equal(cantidadValidaParaUnidad(NaN, 'kilo'), false);
  assert.equal(cantidadValidaParaUnidad('abc', 'kilo'), false);
  assert.equal(cantidadValidaParaUnidad(5, 'litro'), false);
});

test('sumar kilos no arrastra errores de coma flotante (RNF-1)', () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(redondearCantidad(0.1 + 0.2), 0.3);
  assert.equal(redondearCantidad(1.0005), 1.001);
});

test('la unidad solo cambia si el producto no tiene historia (RF-12)', () => {
  assert.equal(puedeCambiarUnidad('unidad', 'kilo', false), true);
  assert.equal(puedeCambiarUnidad('unidad', 'kilo', true), false);
  assert.equal(puedeCambiarUnidad('unidad', 'unidad', true), true);
  assert.equal(puedeCambiarUnidad('unidad', 'litro', false), false);
});

test('datos completos devuelven los valores normalizados (RF-1, RF-8)', () => {
  const { valores, error } = validarDatosProducto({
    ...datosValidos,
    nombre: '  Leche   entera 1 L ',
    codigo_barras: ' 7801234567890 ',
    stock_minimo: '6',
    stock: 24,
  });
  assert.equal(error, undefined);
  assert.deepEqual(valores, {
    nombre: 'Leche entera 1 L',
    codigoBarras: '7801234567890',
    categoriaId: 3,
    unidad: 'unidad',
    precioVenta: 1290,
    costo: 950,
    stockMinimo: 6,
    stockInicial: 24,
  });
});

test('sin código, mínimo ni stock inicial se usan los valores por defecto (RF-6, RF-8)', () => {
  const { valores } = validarDatosProducto(datosValidos);
  assert.equal(valores.codigoBarras, null);
  assert.equal(valores.stockMinimo, 0);
  assert.equal(valores.stockInicial, 0);
});

test('un producto por kilo acepta mínimo y stock inicial con decimales (RF-7)', () => {
  const { valores } = validarDatosProducto({
    ...datosValidos,
    unidad_medida: 'kilo',
    stock_minimo: 2.5,
    stock: '10.125',
  });
  assert.equal(valores.stockMinimo, 2.5);
  assert.equal(valores.stockInicial, 10.125);
});

test('cada campo inválido devuelve su error en español (RF-1, RF-2, RF-3, RF-5, RF-7)', () => {
  const caso = (cambios) => validarDatosProducto({ ...datosValidos, ...cambios }).error;

  assert.match(caso({ nombre: '   ' }), /nombre/);
  assert.match(caso({ categoria_id: undefined }), /categoría/);
  assert.match(caso({ categoria_id: 'abc' }), /categoría/);
  assert.match(caso({ unidad_medida: 'litro' }), /unidad o por kilo/);
  assert.match(caso({ precio_venta: 0 }), /precio de venta/);
  assert.match(caso({ precio_venta: 1290.5 }), /precio de venta/);
  assert.match(caso({ precio_costo: -1 }), /costo/);
  assert.match(caso({ precio_costo: undefined }), /costo/);
  assert.match(caso({ codigo_barras: '78 01' }), /código de barras/);
  assert.match(caso({ stock_minimo: 1.5 }), /stock mínimo/);
  assert.match(caso({ stock: 2.5 }), /stock inicial/);
  assert.match(caso({ stock: -3 }), /stock inicial/);
});

test('en edición el stock del cuerpo se ignora y no hay stock inicial (RF-10)', () => {
  const { valores } = validarDatosProducto({ ...datosValidos, stock: 999 }, 'edicion');
  assert.equal('stockInicial' in valores, false);
});

test('sin cuerpo se rechaza con un error y no lanza excepción (RF-9)', () => {
  assert.ok(validarDatosProducto(undefined).error);
  assert.ok(validarDatosProducto(null, 'edicion').error);
});
