// Pruebas unitarias de las funciones puras de los reportes (spec 005).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armarCobrado,
  armarGananciasPorProducto,
  armarResumenVentas,
  calcularMargen,
  ordenarPorReponer,
  rangoDeReporte,
} from './reportes.js';

const HOY = new Date(2026, 10, 24, 15, 30); // 24-11-2026

test('sin fechas el reporte es de hoy (RF-8)', () => {
  const r = rangoDeReporte({}, HOY);
  assert.equal(r.ok, true);
  assert.deepEqual([r.desde, r.hasta], ['2026-11-24', '2026-11-24']);
  assert.deepEqual([r.inicio, r.fin], ['2026-11-24 00:00:00', '2026-11-25 00:00:00']);
});

test('un período válido incluye el día "hasta" completo (RF-8)', () => {
  const r = rangoDeReporte({ desde: '2026-11-01', hasta: '2026-11-30' }, HOY);
  assert.equal(r.ok, true);
  assert.deepEqual([r.inicio, r.fin], ['2026-11-01 00:00:00', '2026-12-01 00:00:00']);
});

test('un período de hasta un año es válido y uno más largo se rechaza diciendo qué corregir (RF-8)', () => {
  assert.equal(rangoDeReporte({ desde: '2026-01-01', hasta: '2026-12-31' }, HOY).ok, true); // 365 días
  assert.equal(rangoDeReporte({ desde: '2024-01-01', hasta: '2024-12-31' }, HOY).ok, true); // 366 días (bisiesto)
  const largo = rangoDeReporte({ desde: '2025-11-01', hasta: '2026-11-24' }, HOY);
  assert.equal(largo.ok, false);
  assert.match(largo.mensaje, /hasta un año/);
});

test('las fechas inválidas o invertidas se rechazan (RF-8)', () => {
  assert.match(rangoDeReporte({ desde: '24-11-2026' }, HOY).mensaje, /AAAA-MM-DD/);
  assert.match(rangoDeReporte({ desde: '2026-02-31' }, HOY).mensaje, /AAAA-MM-DD/);
  assert.match(rangoDeReporte({ desde: '2026-11-25', hasta: '2026-11-24' }, HOY).mensaje, /desde/);
});

test('solo las completadas suman al vendido, con su desglose por método y promedio entero (RF-4)', () => {
  const r = armarResumenVentas([
    { estado: 'completada', metodo_pago: 'efectivo', cantidad: 3, total: '7890.00' },
    { estado: 'completada', metodo_pago: 'debito', cantidad: 2, total: 12560 },
    { estado: 'completada', metodo_pago: 'credito', cantidad: 1, total: 4770 },
    { estado: 'completada', metodo_pago: 'fiado', cantidad: 4, total: 45608 },
  ]);
  assert.equal(r.vendido, 70828);
  assert.equal(r.cantidad, 10);
  assert.equal(r.promedio, 7083); // 7082,8
  assert.deepEqual(r.por_metodo.efectivo, { cantidad: 3, total: 7890 });
  assert.deepEqual(r.por_metodo.fiado, { cantidad: 4, total: 45608 });
  const suma = Object.values(r.por_metodo).reduce((s, m) => s + m.total, 0);
  assert.equal(suma, r.vendido, 'el desglose por método suma el total');
});

test('las anuladas se cuentan con su monto y las canceladas solo se cuentan, sin sumar al vendido (RF-6)', () => {
  const r = armarResumenVentas([
    { estado: 'completada', metodo_pago: 'efectivo', cantidad: 2, total: 5000 },
    { estado: 'anulada', metodo_pago: 'efectivo', cantidad: 1, total: 3000 },
    { estado: 'anulada', metodo_pago: 'fiado', cantidad: 1, total: 2000 },
    { estado: 'cancelada', metodo_pago: 'efectivo', cantidad: 2, total: 900 },
    { estado: 'cancelada_automaticamente', metodo_pago: 'efectivo', cantidad: 1, total: 400 },
  ]);
  assert.equal(r.vendido, 5000);
  assert.equal(r.cantidad, 2);
  assert.deepEqual(r.anuladas, { cantidad: 2, total: 5000 });
  assert.deepEqual(r.canceladas, { cantidad: 3 });
});

test('un período sin ventas queda todo en cero, sin errores (RF-4)', () => {
  const r = armarResumenVentas([]);
  assert.equal(r.vendido, 0);
  assert.equal(r.cantidad, 0);
  assert.equal(r.promedio, 0);
  assert.deepEqual(r.por_metodo.efectivo, { cantidad: 0, total: 0 });
  assert.deepEqual(r.anuladas, { cantidad: 0, total: 0 });
  assert.deepEqual(r.canceladas, { cantidad: 0 });
});

test('lo cobrado suma ventas en efectivo, débito y crédito más los abonos; el fiado no es cobrado (RF-7)', () => {
  const resumen = armarResumenVentas([
    { estado: 'completada', metodo_pago: 'efectivo', cantidad: 1, total: 10000 },
    { estado: 'completada', metodo_pago: 'debito', cantidad: 1, total: 5000 },
    { estado: 'completada', metodo_pago: 'fiado', cantidad: 1, total: 20000 },
  ]);
  const cobrado = armarCobrado({
    porMetodo: resumen.por_metodo,
    abonos: [
      { metodo_pago: 'efectivo', total: '3000.00' },
      { metodo_pago: 'transferencia', total: 4000 },
    ],
  });
  assert.deepEqual(cobrado.ventas, { efectivo: 10000, debito: 5000, credito: 0 });
  assert.deepEqual(cobrado.abonos, { efectivo: 3000, debito: 0, credito: 0, transferencia: 4000 });
  assert.equal(cobrado.total_ventas, 15000);
  assert.equal(cobrado.total_abonos, 7000);
  assert.equal(cobrado.total, 22000);
  assert.equal(cobrado.vendido_al_fiado, 20000);
});

test('un abono antiguo sin método se informa aparte y también suma a lo cobrado (RF-7)', () => {
  const cobrado = armarCobrado({
    porMetodo: {},
    abonos: [{ metodo_pago: null, total: 2500 }, { metodo_pago: 'credito', total: 1000 }],
  });
  assert.equal(cobrado.abonos.sin_metodo, 2500);
  assert.equal(cobrado.abonos.credito, 1000);
  assert.equal(cobrado.total_abonos, 3500);
  assert.equal(cobrado.total, 3500);
  assert.equal(armarCobrado({ porMetodo: {}, abonos: [] }).abonos.sin_metodo, undefined);
});

test('la ganancia es vendido menos costo y el margen es un porcentaje entero (RF-10)', () => {
  assert.deepEqual(calcularMargen(10000, 6000), { ganancia: 4000, margen: 40 });
  assert.deepEqual(calcularMargen(3, 2), { ganancia: 1, margen: 33 }); // 33,3
  assert.deepEqual(calcularMargen(2, 1), { ganancia: 1, margen: 50 });
  assert.deepEqual(calcularMargen(1000, 1000), { ganancia: 0, margen: 0 });
});

test('sin ventas el margen es 0 y con costo mayor que la venta es negativo (RF-10)', () => {
  assert.deepEqual(calcularMargen(0, 0), { ganancia: 0, margen: 0 });
  assert.deepEqual(calcularMargen(1000, 1500), { ganancia: -500, margen: -50 });
  assert.deepEqual(calcularMargen('4000.00', '2500.00'), { ganancia: 1500, margen: 38 }); // 37,5
});

test('la ganancia por producto va de mayor a menor, con margen y la marca de costo $0 (RF-11, RF-13)', () => {
  const filas = armarGananciasPorProducto([
    { producto_id: 1, nombre: 'Tomate', unidad_medida: 'kilo', cantidad: '1.350', vendido: 2147, costo: 1215, con_costo_cero: 0 },
    { producto_id: 2, nombre: 'Pan', unidad_medida: 'unidad', cantidad: '10.000', vendido: 2500, costo: 0, con_costo_cero: 1 },
    { producto_id: 3, nombre: 'Palta', unidad_medida: 'kilo', cantidad: 2, vendido: 9980, costo: 6400, con_costo_cero: '0' },
  ]);
  assert.deepEqual(filas.map((f) => f.nombre), ['Palta', 'Pan', 'Tomate']); // 3580, 2500, 932
  assert.deepEqual([filas[0].ganancia, filas[0].margen], [3580, 36]);
  assert.deepEqual([filas[1].ganancia, filas[1].margen, filas[1].costo_cero], [2500, 100, true]);
  assert.equal(filas[2].costo_cero, false);
  assert.equal(filas[2].cantidad, 1.35);
});

test('con la misma ganancia, los productos se ordenan por nombre (RF-11)', () => {
  const filas = armarGananciasPorProducto([
    { producto_id: 1, nombre: 'Zanahoria', unidad_medida: 'kilo', cantidad: 1, vendido: 1000, costo: 500 },
    { producto_id: 2, nombre: 'Ají', unidad_medida: 'unidad', cantidad: 1, vendido: 1000, costo: 500 },
  ]);
  assert.deepEqual(filas.map((f) => f.nombre), ['Ají', 'Zanahoria']);
  assert.equal(armarGananciasPorProducto([]).length, 0);
});

test('por reponer: primero los agotados y luego los de stock bajo, por stock y nombre (RF-15)', () => {
  const productos = [
    { id: 1, nombre: 'Leche', stock: '3.000', stock_minimo: '5.000', activo: 1 },
    { id: 2, nombre: 'Arroz', stock: '0.000', stock_minimo: '5.000', activo: 1 },
    { id: 3, nombre: 'Té', stock: '1.000', stock_minimo: '5.000', activo: 1 },
    { id: 4, nombre: 'Azúcar', stock: '0.000', stock_minimo: '0.000', activo: 1 },
    { id: 5, nombre: 'Sal', stock: '20.000', stock_minimo: '5.000', activo: 1 },
    { id: 6, nombre: 'Pasta', stock: '3.000', stock_minimo: '5.000', activo: 1 },
  ];
  const r = ordenarPorReponer(productos);
  assert.deepEqual(r.map((p) => [p.nombre, p.estado]), [
    ['Arroz', 'agotado'], ['Azúcar', 'agotado'], ['Té', 'bajo'], ['Leche', 'bajo'], ['Pasta', 'bajo'],
  ]);
  assert.equal(productos.length, 6, 'no muta la entrada');
});

test('por reponer: los productos desactivados y los de stock normal no aparecen (RF-15)', () => {
  const r = ordenarPorReponer([
    { id: 1, nombre: 'Desactivado agotado', stock: 0, stock_minimo: 5, activo: 0 },
    { id: 2, nombre: 'Sin mínimo', stock: 2, stock_minimo: 0, activo: 1 },
    { id: 3, nombre: 'En el mínimo', stock: 5, stock_minimo: 5, activo: 1 },
  ]);
  assert.deepEqual(r.map((p) => p.nombre), ['En el mínimo']);
  assert.deepEqual(ordenarPorReponer([]), []);
});
