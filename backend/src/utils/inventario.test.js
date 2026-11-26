// Pruebas unitarias de las decisiones puras de la spec 002 (sin base de datos ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armarMovimiento,
  calcularAjuste,
  cantidadValidaParaUnidad,
  esCodigoBarrasValido,
  esCostoValido,
  esNombreValido,
  esPrecioVentaValido,
  esUnidadValida,
  estadoStock,
  hayVentaConPerdida,
  normalizarCodigoBarras,
  normalizarNombre,
  ordenarProductos,
  puedeCambiarUnidad,
  redondearCantidad,
  resumirAlertas,
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

// ---------------------------------------------------------------------------
// Ajuste de stock, historial y estado de stock (T2)
// ---------------------------------------------------------------------------

test('la merma resta, la reposición suma y la corrección fija el stock (RF-23)', () => {
  const base = { stockActual: 10, unidad: 'unidad' };
  assert.deepEqual(calcularAjuste({ ...base, tipo: 'merma', cantidad: 3 }),
    { ok: true, stockNuevo: 7, diferencia: -3 });
  assert.deepEqual(calcularAjuste({ ...base, tipo: 'reposicion', cantidad: 5 }),
    { ok: true, stockNuevo: 15, diferencia: 5 });
  assert.deepEqual(calcularAjuste({ ...base, tipo: 'correccion', cantidad: 4 }),
    { ok: true, stockNuevo: 4, diferencia: -6 });
});

test('cantidad 0 o negativa se rechaza, salvo la corrección a 0 (RF-24)', () => {
  const base = { stockActual: 10, unidad: 'unidad' };
  assert.equal(calcularAjuste({ ...base, tipo: 'merma', cantidad: 0 }).codigo, 'CANTIDAD_INVALIDA');
  assert.equal(calcularAjuste({ ...base, tipo: 'reposicion', cantidad: 0 }).codigo, 'CANTIDAD_INVALIDA');
  assert.equal(calcularAjuste({ ...base, tipo: 'merma', cantidad: -2 }).codigo, 'CANTIDAD_INVALIDA');
  assert.equal(calcularAjuste({ ...base, tipo: 'merma', cantidad: 'abc' }).codigo, 'CANTIDAD_INVALIDA');
  assert.deepEqual(calcularAjuste({ ...base, tipo: 'correccion', cantidad: 0 }),
    { ok: true, stockNuevo: 0, diferencia: -10 });
});

test('la merma mayor al stock se rechaza e informa el stock actual (RF-25)', () => {
  const resultado = calcularAjuste({ tipo: 'merma', cantidad: 11, stockActual: 10, unidad: 'unidad' });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, 'STOCK_INSUFICIENTE');
  assert.equal(resultado.stockActual, 10);
  assert.match(resultado.mensaje, /10/);
  // Mermar exactamente el stock es válido y deja 0.
  assert.equal(calcularAjuste({ tipo: 'merma', cantidad: 10, stockActual: 10, unidad: 'unidad' }).stockNuevo, 0);
});

test('un motivo desconocido se rechaza (RF-22)', () => {
  const resultado = calcularAjuste({ tipo: 'regalo', cantidad: 1, stockActual: 5, unidad: 'unidad' });
  assert.equal(resultado.codigo, 'MOTIVO_INVALIDO');
});

test('por unidad se rechazan decimales y por kilo pasan hasta 3 (RF-7, RF-24)', () => {
  assert.equal(calcularAjuste({ tipo: 'reposicion', cantidad: 2.5, stockActual: 1, unidad: 'unidad' }).ok, false);
  const kilos = calcularAjuste({ tipo: 'reposicion', cantidad: 2.5, stockActual: 1.25, unidad: 'kilo' });
  assert.deepEqual(kilos, { ok: true, stockNuevo: 3.75, diferencia: 2.5 });
  // Sin error de coma flotante al sumar kilos.
  assert.equal(calcularAjuste({ tipo: 'reposicion', cantidad: 0.2, stockActual: 0.1, unidad: 'kilo' }).stockNuevo, 0.3);
});

test('una corrección igual al stock deja diferencia 0 (RF-23)', () => {
  assert.deepEqual(calcularAjuste({ tipo: 'correccion', cantidad: 10, stockActual: 10, unidad: 'unidad' }),
    { ok: true, stockNuevo: 10, diferencia: 0 });
});

test('el movimiento lleva diferencia con signo, antes y después, nota recortada y fecha (RF-8, RF-26)', () => {
  const hoy = new Date('2026-11-20T15:30:00.000Z');
  const movimiento = armarMovimiento({
    productoId: 7, usuarioId: 2, tipo: 'merma', stockAntes: 10, stockDespues: 7, nota: '  se cayó la caja  ', hoy,
  });
  assert.deepEqual(movimiento, {
    productoId: 7,
    usuarioId: 2,
    tipo: 'merma',
    cantidad: -3,
    stockAntes: 10,
    stockDespues: 7,
    nota: 'se cayó la caja',
    ventaId: null,
    creadoEn: hoy,
  });
  const sinNota = armarMovimiento({ productoId: 7, usuarioId: 2, tipo: 'reposicion', stockAntes: 0, stockDespues: 5, nota: '   ', hoy });
  assert.equal(sinNota.nota, null);
  assert.equal(sinNota.cantidad, 5);
  const larga = armarMovimiento({ productoId: 7, usuarioId: 2, tipo: 'correccion', stockAntes: 1, stockDespues: 1, nota: 'x'.repeat(300), hoy });
  assert.equal(larga.nota.length, 255);
  assert.equal(larga.cantidad, 0);
});

test('el estado de stock distingue agotado, bajo, normal y sin alerta (RF-31, RF-34)', () => {
  assert.equal(estadoStock({ stock: 0, stockMinimo: 5, activo: 1 }), 'agotado');
  // Agotado aunque el mínimo sea 0.
  assert.equal(estadoStock({ stock: 0, stockMinimo: 0, activo: 1 }), 'agotado');
  assert.equal(estadoStock({ stock: 3, stockMinimo: 5, activo: 1 }), 'bajo');
  assert.equal(estadoStock({ stock: 5, stockMinimo: 5, activo: 1 }), 'bajo');
  assert.equal(estadoStock({ stock: 6, stockMinimo: 5, activo: 1 }), 'normal');
  // Un mínimo 0 no genera "bajo".
  assert.equal(estadoStock({ stock: 2, stockMinimo: 0, activo: 1 }), 'normal');
  // Desactivado: sin alerta, incluso agotado.
  assert.equal(estadoStock({ stock: 0, stockMinimo: 5, activo: 0 }), 'sin_alerta');
  assert.equal(estadoStock({ stock: 1, stockMinimo: 5, activo: false }), 'sin_alerta');
});

test('el resumen cuenta solo productos activos (RF-33, RF-34)', () => {
  const productos = [
    { stock: 0, stock_minimo: 3, activo: 1 },
    { stock: 2, stock_minimo: 3, activo: 1 },
    { stock: 3, stock_minimo: 3, activo: 1 },
    { stock: 9, stock_minimo: 3, activo: 1 },
    { stock: 5, stock_minimo: 0, activo: 1 },
    { stock: 0, stock_minimo: 3, activo: 0 },
    { stock: 1, stock_minimo: 3, activo: 0 },
  ];
  assert.deepEqual(resumirAlertas(productos), { stockBajo: 2, agotados: 1 });
  assert.deepEqual(resumirAlertas([]), { stockBajo: 0, agotados: 0 });
});

test('los activos van primero y luego por nombre, sin mutar la lista (RF-17)', () => {
  const entrada = [
    { nombre: 'Zanahoria', activo: 1 },
    { nombre: 'Arroz', activo: 0 },
    { nombre: 'Ñoquis', activo: 1 },
    { nombre: 'Azúcar', activo: 1 },
    { nombre: 'Bebida', activo: 0 },
  ];
  const copia = [...entrada];
  const salida = ordenarProductos(entrada);
  assert.deepEqual(salida.map((p) => p.nombre), ['Azúcar', 'Ñoquis', 'Zanahoria', 'Arroz', 'Bebida']);
  assert.deepEqual(entrada, copia);
});
