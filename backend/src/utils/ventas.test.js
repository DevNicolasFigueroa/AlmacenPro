// Pruebas unitarias de las decisiones puras de la spec 003 (sin base de datos ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armarResumenHistorial,
  calcularCostoLinea,
  calcularSubtotal,
  calcularTotal,
  calcularVuelto,
  estadoCuenta,
  evaluarStockAlAgregar,
  formatearPesos,
  normalizarMotivo,
  puedeAnular,
  rangoDeFechas,
  validarCantidadLinea,
  validarCobro,
  verificarCarritoParaConfirmar,
} from './ventas.js';

test('el subtotal redondea al peso más cercano y el medio peso sube (RF-11)', () => {
  assert.equal(calcularSubtotal(1590, 0.35), 557); // 556,5 -> 557
  assert.equal(calcularSubtotal(1000, 2), 2000);
  assert.equal(calcularSubtotal(990, 0.5), 495);
  assert.equal(calcularSubtotal(1001, 0.5), 501); // 500,5 -> 501
  assert.equal(calcularSubtotal(1000, 0.4994), 499); // 499,4 -> 499
  assert.equal(calcularSubtotal(1000, 0.0004), 0);
});

test('el costo de una línea redondea igual que el subtotal: medio peso hacia arriba, kilos con 3 decimales (spec 005, RF-1, RF-10)', () => {
  assert.equal(calcularCostoLinea(900, 1.35), 1215);
  assert.equal(calcularCostoLinea(1001, 0.5), 501); // 500,5 -> 501
  assert.equal(calcularCostoLinea(1000, 0.4994), 499);
  assert.equal(calcularCostoLinea(0, 12), 0);
  assert.equal(calcularCostoLinea(100000000, 9999.999), 999999900000);
  assert.equal(calcularCostoLinea('1590.00', '0.350'), calcularSubtotal(1590, 0.35));
});

test('el subtotal no pierde exactitud con montos grandes ni con kilos exactos (RF-11)', () => {
  assert.equal(calcularSubtotal(100000000, 9999.999), 999999900000);
  assert.equal(calcularSubtotal(999999999, 1000), 999999999000);
  // 0.1 + 0.2 en kilos llega como 0.30000000000000004: igual debe dar 0,3 kg
  assert.equal(calcularSubtotal(1000, 0.1 + 0.2), 300);
});

test('el total suma los subtotales ya redondeados, no redondea la suma (RF-11)', () => {
  const lineas = [
    { precio_unitario: 1001, cantidad: 0.5 }, // 500,5 -> 501
    { precio_unitario: 1001, cantidad: 0.5 }, // 500,5 -> 501
  ];
  // Sin redondear cada línea la suma daría 1001; con las líneas ya redondeadas da 1002.
  assert.equal(calcularTotal(lineas), 1002);
  assert.equal(calcularTotal([]), 0);
  assert.equal(calcularTotal([
    { precio_unitario: 1590, cantidad: 0.35 }, // 557
    { precio_unitario: 1290, cantidad: 2 }, // 2580
  ]), 3137);
});

test('la cantidad de una línea es entera por unidad y de hasta 3 decimales por kilo (RF-4)', () => {
  assert.deepEqual(validarCantidadLinea({ cantidad: 3, unidad: 'unidad', precio: 1290 }), { ok: true, cantidad: 3 });
  assert.equal(validarCantidadLinea({ cantidad: 1.5, unidad: 'unidad', precio: 1290 }).ok, false);
  assert.deepEqual(validarCantidadLinea({ cantidad: '0.35', unidad: 'kilo', precio: 1590 }), { ok: true, cantidad: 0.35 });
  assert.equal(validarCantidadLinea({ cantidad: 0.3501, unidad: 'kilo', precio: 1590 }).ok, false);
});

test('cantidad 0, negativa o que no es un número se rechaza (RF-4)', () => {
  for (const cantidad of [0, -1, 'abc', null, undefined, NaN]) {
    const resultado = validarCantidadLinea({ cantidad, unidad: 'unidad', precio: 1290 });
    assert.equal(resultado.ok, false, `cantidad ${String(cantidad)}`);
    assert.equal(resultado.codigo, 'CANTIDAD_INVALIDA');
  }
});

test('si el subtotal queda en $0 se pide una cantidad mayor (RF-13)', () => {
  const resultado = validarCantidadLinea({ cantidad: 0.001, unidad: 'kilo', precio: 100 });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, 'SUBTOTAL_CERO');
  assert.match(resultado.mensaje, /mayor/);
});

test('al agregar se rechaza lo desactivado, lo agotado y lo que supera el stock (RF-7, RF-8)', () => {
  const desactivado = evaluarStockAlAgregar({ stock: 5, pedida: 1, activo: false, nombre: 'Pan' });
  assert.equal(desactivado.codigo, 'PRODUCTO_DESACTIVADO');

  const agotado = evaluarStockAlAgregar({ stock: 0, pedida: 1, activo: true, nombre: 'Pan' });
  assert.equal(agotado.codigo, 'AGOTADO');

  const insuficiente = evaluarStockAlAgregar({ stock: 2, pedida: 3, activo: true, nombre: 'Pan' });
  assert.equal(insuficiente.codigo, 'STOCK_INSUFICIENTE');
  assert.equal(insuficiente.stockDisponible, 2);
  assert.match(insuficiente.mensaje, /Solo quedan 2 u\. de «Pan»/);
});

test('al agregar se suma lo que ya hay en el carrito y los kilos usan coma (RF-5, RF-7)', () => {
  const ok = evaluarStockAlAgregar({ stock: 5, enCarrito: 2, pedida: 3, activo: true });
  assert.deepEqual(ok, { ok: true, cantidadTotal: 5 });

  const sobra = evaluarStockAlAgregar({
    stock: 2.5, enCarrito: 2, pedida: 1, activo: true, unidad: 'kilo', nombre: 'Tomate',
  });
  assert.equal(sobra.ok, false);
  assert.match(sobra.mensaje, /Solo quedan 2,5 kg de «Tomate»/);
});

test('al confirmar se informan todos los problemas del carrito juntos (RF-26, RF-27)', () => {
  const lineas = [
    { producto_id: 1, cantidad: 3 },
    { producto_id: 2, cantidad: 1 },
    { producto_id: 3, cantidad: 1 },
  ];
  const productos = [
    { id: 1, nombre: 'Pan', stock: 2, unidad_medida: 'unidad', activo: 1 },
    { id: 2, nombre: 'Leche', stock: 9, unidad_medida: 'unidad', activo: 0 },
    { id: 3, nombre: 'Arroz', stock: 4, unidad_medida: 'unidad', activo: 1 },
  ];

  const resultado = verificarCarritoParaConfirmar(lineas, productos);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.problemas.length, 2);
  assert.equal(resultado.codigo, 'PRODUCTO_DESACTIVADO');

  const stock = resultado.problemas.find((problema) => problema.codigo === 'STOCK_INSUFICIENTE');
  assert.equal(stock.productoId, 1);
  assert.equal(stock.stockDisponible, 2);
  assert.match(stock.mensaje, /Solo quedan 2 u\. de «Pan»/);
});

test('si el producto se agotó, el mensaje pide quitarlo en vez de decir que quedan 0 (RF-26)', () => {
  const resultado = verificarCarritoParaConfirmar(
    [{ producto_id: 1, cantidad: 1 }],
    [{ id: 1, nombre: 'Pan', stock: 0, unidad_medida: 'unidad', activo: 1 }]
  );
  assert.equal(resultado.problemas[0].stockDisponible, 0);
  assert.match(resultado.problemas[0].mensaje, /se agotó: quítalo/);
});

test('un carrito con stock suficiente y productos activos se puede confirmar (RF-25)', () => {
  const resultado = verificarCarritoParaConfirmar(
    [{ producto_id: 1, cantidad: 2 }],
    [{ id: 1, nombre: 'Pan', stock: 2, unidad_medida: 'unidad', activo: 1 }]
  );
  assert.deepEqual(resultado, { ok: true });
});

test('un carrito vacío no se puede confirmar (RF-30)', () => {
  const resultado = verificarCarritoParaConfirmar([], []);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, 'CARRITO_VACIO');
});

test('un producto que ya no existe se trata como desactivado (RF-27)', () => {
  const resultado = verificarCarritoParaConfirmar([{ producto_id: 9, cantidad: 1 }], []);
  assert.equal(resultado.codigo, 'PRODUCTO_DESACTIVADO');
});

test('el vuelto es la diferencia y, si no alcanza, lo que falta (RF-15)', () => {
  assert.deepEqual(calcularVuelto(3137, 5000), { vuelto: 1863, faltan: 0 });
  assert.deepEqual(calcularVuelto(3137, 3137), { vuelto: 0, faltan: 0 });
  assert.deepEqual(calcularVuelto(3137, 3000), { vuelto: 0, faltan: 137 });
});

test('el método de pago debe ser uno de los cuatro (RF-14)', () => {
  assert.equal(validarCobro({ metodoPago: 'cheque', total: 1000 }).codigo, 'METODO_INVALIDO');
  assert.equal(validarCobro({ metodoPago: undefined, total: 1000 }).codigo, 'METODO_INVALIDO');
});

test('en efectivo el monto recibido debe alcanzar el total y se calcula el vuelto (RF-15)', () => {
  assert.deepEqual(
    validarCobro({ metodoPago: 'efectivo', total: 3137, montoRecibido: 5000 }),
    { ok: true, vuelto: 1863 }
  );
  assert.equal(validarCobro({ metodoPago: 'efectivo', total: 3137, montoRecibido: 3137 }).vuelto, 0);

  const corto = validarCobro({ metodoPago: 'efectivo', total: 3137, montoRecibido: 3000 });
  assert.equal(corto.codigo, 'MONTO_INSUFICIENTE');
  assert.equal(corto.faltan, 137);
  assert.match(corto.mensaje, /faltan \$137/);

  assert.equal(validarCobro({ metodoPago: 'efectivo', total: 3137 }).codigo, 'MONTO_INVALIDO');
  assert.equal(validarCobro({ metodoPago: 'efectivo', total: 3137, montoRecibido: 3137.5 }).codigo, 'MONTO_INVALIDO');
});

test('débito y crédito solo registran el método, sin monto ni vuelto (RF-16)', () => {
  assert.deepEqual(validarCobro({ metodoPago: 'debito', total: 1000 }), { ok: true, vuelto: null });
  assert.deepEqual(validarCobro({ metodoPago: 'credito', total: 1000 }), { ok: true, vuelto: null });
});

test('el fiado exige un cliente identificado (RF-17)', () => {
  assert.equal(validarCobro({ metodoPago: 'fiado', total: 1000 }).codigo, 'FIADO_SIN_CLIENTE');
  assert.equal(validarCobro({ metodoPago: 'fiado', total: 1000, clienteId: 0 }).codigo, 'FIADO_SIN_CLIENTE');
  assert.deepEqual(validarCobro({ metodoPago: 'fiado', total: 1000, clienteId: 7 }), { ok: true, vuelto: null });
});

test('solo una venta completada se puede anular (RF-42, RF-45)', () => {
  assert.deepEqual(puedeAnular({ estado: 'completada' }), { ok: true });
  assert.equal(puedeAnular({ estado: 'anulada' }).codigo, 'YA_ANULADA');
  assert.equal(puedeAnular({ estado: 'en_curso' }).codigo, 'NO_CONFIRMADA');
  assert.equal(puedeAnular({ estado: 'cancelada' }).codigo, 'NO_CONFIRMADA');
  assert.equal(puedeAnular({ estado: 'cancelada_automaticamente' }).ok, false);
  assert.equal(puedeAnular(null).ok, false);
});

test('el motivo de anulación es obligatorio, se recorta y tiene tope (RF-42)', () => {
  assert.equal(normalizarMotivo('').ok, false);
  assert.equal(normalizarMotivo('   ').ok, false);
  assert.equal(normalizarMotivo(undefined).ok, false);
  assert.deepEqual(normalizarMotivo('  Cobro   duplicado '), { ok: true, motivo: 'Cobro duplicado' });
  assert.equal(normalizarMotivo('x'.repeat(256)).ok, false);
  assert.equal(normalizarMotivo('x'.repeat(255)).ok, true);
});

test('sin fechas el historial muestra hoy (RF-36)', () => {
  const resultado = rangoDeFechas({}, new Date(2026, 10, 21, 15, 30));
  assert.deepEqual(resultado, {
    ok: true,
    desde: '2026-11-21',
    hasta: '2026-11-21',
    inicio: '2026-11-21 00:00:00',
    fin: '2026-11-22 00:00:00',
  });
});

test('un día o un rango; el fin incluye todo el último día (RF-36)', () => {
  const hoy = new Date(2026, 10, 21);
  const dia = rangoDeFechas({ desde: '2026-03-05' }, hoy);
  assert.equal(dia.inicio, '2026-03-05 00:00:00');
  assert.equal(dia.fin, '2026-03-06 00:00:00');

  const rango = rangoDeFechas({ desde: '2026-12-30', hasta: '2026-12-31' }, hoy);
  assert.equal(rango.inicio, '2026-12-30 00:00:00');
  assert.equal(rango.fin, '2027-01-01 00:00:00'); // cruza de año

  const soloHasta = rangoDeFechas({ hasta: '2026-03-05' }, hoy);
  assert.equal(soloHasta.desde, '2026-03-05');
});

test('fechas con formato inválido, inexistentes o invertidas se rechazan (RF-36)', () => {
  const hoy = new Date(2026, 10, 21);
  assert.equal(rangoDeFechas({ desde: '21/11/2026' }, hoy).ok, false);
  assert.equal(rangoDeFechas({ desde: '2026-02-30' }, hoy).ok, false);
  assert.equal(rangoDeFechas({ desde: '2026-11-22', hasta: '2026-11-21' }, hoy).ok, false);
});

test('en el resumen solo las completadas suman; anuladas y canceladas se cuentan aparte (RF-37, RF-48)', () => {
  const resumen = armarResumenHistorial([
    { estado: 'completada', cantidad: 12, total: '45890.00' },
    { estado: 'anulada', cantidad: 2, total: '9990.00' },
    { estado: 'cancelada', cantidad: 3, total: '5000.00' },
    { estado: 'cancelada_automaticamente', cantidad: 1, total: '1200.00' },
  ]);
  assert.deepEqual(resumen, {
    completadas: { cantidad: 12, total: 45890 },
    anuladas: { cantidad: 2 },
    canceladas: { cantidad: 4 },
  });
});

test('un período sin ventas da un resumen en cero (RF-37)', () => {
  assert.deepEqual(armarResumenHistorial([]), {
    completadas: { cantidad: 0, total: 0 },
    anuladas: { cantidad: 0 },
    canceladas: { cantidad: 0 },
  });
});

test('la cuenta del cliente está en deuda, al día o a favor según su saldo (RF-18, RF-44)', () => {
  assert.equal(estadoCuenta(15000), 'deuda');
  assert.equal(estadoCuenta('2500.00'), 'deuda');
  assert.equal(estadoCuenta(0), 'al_dia');
  assert.equal(estadoCuenta(-3000), 'a_favor');
});

test('los montos se muestran en pesos chilenos sin decimales (RNF-5)', () => {
  assert.equal(formatearPesos(1490), '$1.490');
  assert.equal(formatearPesos(137), '$137');
  assert.equal(formatearPesos(1234567), '$1.234.567');
});
