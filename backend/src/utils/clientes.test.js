// Pruebas unitarias de clientes y fiado (spec 004).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularSaldo,
  escaparComodinesLike,
  evaluarAbono,
  interpretarBusqueda,
  normalizarObservacion,
  puedeAnularAbono,
  validarDatosCliente,
  validarFiltroListado,
  validarMetodoAbono,
  validarMontoAbono,
} from './clientes.js';

test('un abono en pesos enteros mayores que 0 es válido, escrito como número o como texto (RF-10)', () => {
  assert.deepEqual(validarMontoAbono(15000), { ok: true, monto: 15000 });
  assert.deepEqual(validarMontoAbono('15000'), { ok: true, monto: 15000 });
  assert.deepEqual(validarMontoAbono(' 1 '), { ok: true, monto: 1 });
  assert.deepEqual(validarMontoAbono(99_999_999), { ok: true, monto: 99_999_999 });
});

test('un abono de 0, negativo, decimal, vacío o de texto se rechaza diciendo qué corregir (RF-10)', () => {
  assert.match(validarMontoAbono(0).mensaje, /mayor que \$0/);
  assert.match(validarMontoAbono(-500).mensaje, /mayor que \$0/);
  assert.match(validarMontoAbono('-500').mensaje, /mayor que \$0/);
  assert.match(validarMontoAbono(1500.5).mensaje, /pesos enteros/);
  assert.match(validarMontoAbono('1500.5').mensaje, /pesos enteros/);
  for (const invalido of ['', '   ', 'abc', '1.500', null, undefined, NaN, Infinity, {}]) {
    assert.equal(validarMontoAbono(invalido).ok, false, `valor ${String(invalido)}`);
  }
});

test('un abono sobre el tope máximo se rechaza con el tope en pesos chilenos (RF-10)', () => {
  const r = validarMontoAbono(100_000_000);
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /\$99\.999\.999/);
});

test('el método del abono es efectivo, débito, crédito o transferencia (RF-10)', () => {
  for (const metodo of ['efectivo', 'debito', 'credito', 'transferencia']) {
    assert.deepEqual(validarMetodoAbono(metodo), { ok: true, metodo });
  }
  for (const invalido of ['fiado', 'cheque', '', null, undefined]) {
    assert.equal(validarMetodoAbono(invalido).ok, false, `método ${String(invalido)}`);
  }
});

test('un abono menor que la deuda deja saldo pendiente y no pide confirmación (RF-11, RF-12)', () => {
  assert.deepEqual(evaluarAbono({ saldo: 10000, monto: 4000 }), {
    saldoActual: 10000, saldoResultante: 6000, quedaAFavor: 0, requiereConfirmacion: false,
  });
});

test('un abono igual a la deuda deja al cliente al día sin pedir confirmación (RF-12)', () => {
  const r = evaluarAbono({ saldo: 10000, monto: 10000 });
  assert.equal(r.saldoResultante, 0);
  assert.equal(r.quedaAFavor, 0);
  assert.equal(r.requiereConfirmacion, false);
});

test('un abono mayor que la deuda avisa cuánto queda a favor y pide confirmación (RF-12)', () => {
  const r = evaluarAbono({ saldo: 10000, monto: 12500 });
  assert.equal(r.saldoResultante, -2500);
  assert.equal(r.quedaAFavor, 2500);
  assert.equal(r.requiereConfirmacion, true);
});

test('abonar a un cliente al día o con saldo a favor siempre pide confirmación (RF-12)', () => {
  const alDia = evaluarAbono({ saldo: 0, monto: 3000 });
  assert.equal(alDia.quedaAFavor, 3000);
  assert.equal(alDia.requiereConfirmacion, true);

  const aFavor = evaluarAbono({ saldo: -1000, monto: 3000 });
  assert.equal(aFavor.quedaAFavor, 4000);
  assert.equal(aFavor.requiereConfirmacion, true);
});

test('el saldo suma cargos y anulaciones de abono, y resta abonos y anulaciones de venta (RF-26)', () => {
  assert.equal(calcularSaldo([]), 0);
  assert.equal(calcularSaldo([{ tipo: 'cargo', monto: 10000 }]), 10000);
  assert.equal(calcularSaldo([
    { tipo: 'cargo', monto: 10000 },
    { tipo: 'abono', monto: 4000 },
  ]), 6000);
  assert.equal(calcularSaldo([
    { tipo: 'cargo', monto: 10000 },
    { tipo: 'abono', monto: 4000 },
    { tipo: 'anulacion_abono', monto: 4000 },
  ]), 10000);
  assert.equal(calcularSaldo([
    { tipo: 'cargo', monto: 10000 },
    { tipo: 'abono', monto: 4000 },
    { tipo: 'anulacion', monto: 10000 },
  ]), -4000); // saldo a favor
});

test('el saldo cuadra con cualquier combinación de ventas, abonos y anulaciones (RF-26, RNF-3)', () => {
  const movimientos = [
    { tipo: 'cargo', monto: '12000.00' },
    { tipo: 'cargo', monto: 8000 },
    { tipo: 'abono', monto: 5000 },
    { tipo: 'abono', monto: 3000 },
    { tipo: 'anulacion_abono', monto: 3000 },
    { tipo: 'anulacion', monto: 8000 },
  ];
  assert.equal(calcularSaldo(movimientos), 12000 + 8000 - 5000 - 3000 + 3000 - 8000);
});

test('un tipo de movimiento desconocido no se ignora en silencio al calcular el saldo (RF-26)', () => {
  assert.throws(() => calcularSaldo([{ tipo: 'regalo', monto: 100 }]), /desconocido/);
});

test('solo un abono no anulado se puede anular (RF-16, RF-17)', () => {
  assert.deepEqual(puedeAnularAbono({ tipo: 'abono' }, false), { ok: true });
  assert.match(puedeAnularAbono({ tipo: 'abono' }, true).mensaje, /ya está anulado/);
  for (const tipo of ['cargo', 'anulacion', 'anulacion_abono']) {
    assert.match(puedeAnularAbono({ tipo }, false).mensaje, /Solo se pueden anular abonos/, tipo);
  }
  assert.equal(puedeAnularAbono(null, false).ok, false);
});

test('la observación del abono es opcional, se recorta y tiene tope (RF-10)', () => {
  assert.deepEqual(normalizarObservacion(undefined), { ok: true, observacion: null });
  assert.deepEqual(normalizarObservacion(null), { ok: true, observacion: null });
  assert.deepEqual(normalizarObservacion('   '), { ok: true, observacion: null });
  assert.deepEqual(normalizarObservacion('  Pagó   la mitad '), { ok: true, observacion: 'Pagó la mitad' });
  assert.equal(normalizarObservacion('a'.repeat(255)).ok, true);
  assert.match(normalizarObservacion('a'.repeat(256)).mensaje, /255/);
});

test('los datos del cliente se recortan y un texto vacío borra el dato (RF-20)', () => {
  const r = validarDatosCliente({ nombre: '  Ana   Pérez ', telefono: ' +56 9 1234 5678 ', email: '', direccion: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, { nombre: 'Ana Pérez', telefono: '+56 9 1234 5678', email: null, direccion: null });
});

test('solo se validan y devuelven los datos que vienen en la petición (RF-20)', () => {
  assert.deepEqual(validarDatosCliente({ nombre: 'Ana' }).datos, { nombre: 'Ana' });
  assert.equal(validarDatosCliente({}).ok, false);
  assert.equal(validarDatosCliente(undefined).ok, false);
  assert.match(validarDatosCliente({}).mensaje, /No hay datos/);
});

test('los datos del cliente respetan sus topes y formatos (RF-20)', () => {
  assert.equal(validarDatosCliente({ nombre: 'a'.repeat(150) }).ok, true);
  assert.match(validarDatosCliente({ nombre: 'a'.repeat(151) }).mensaje, /nombre admite hasta 150/);
  assert.equal(validarDatosCliente({ telefono: '1'.repeat(20) }).ok, true);
  assert.match(validarDatosCliente({ telefono: '1'.repeat(21) }).mensaje, /teléfono admite hasta 20/);
  assert.match(validarDatosCliente({ telefono: '9 1234 abcd' }).mensaje, /solo puede tener números/);
  assert.match(validarDatosCliente({ telefono: '+-()' }).mensaje, /solo puede tener números/);
  assert.equal(validarDatosCliente({ email: 'ana@correo.cl' }).ok, true);
  for (const correo of ['ana', 'ana@', 'ana@correo', 'a na@correo.cl']) {
    assert.match(validarDatosCliente({ email: correo }).mensaje, /correo no tiene un formato válido/, correo);
  }
  assert.equal(validarDatosCliente({ email: `${'a'.repeat(115)}@b.cl` }).ok, true); // 120 caracteres
  assert.match(validarDatosCliente({ email: `${'a'.repeat(116)}@b.cl` }).mensaje, /correo admite hasta 120/);
  assert.equal(validarDatosCliente({ direccion: 'a'.repeat(200) }).ok, true);
  assert.match(validarDatosCliente({ direccion: 'a'.repeat(201) }).mensaje, /dirección admite hasta 200/);
});

test('un dato que no es texto se rechaza (RF-20)', () => {
  assert.match(validarDatosCliente({ nombre: 7 }).mensaje, /nombre debe ser un texto/);
  assert.match(validarDatosCliente({ telefono: 56912345678 }).mensaje, /teléfono debe ser un texto/);
  assert.match(validarDatosCliente({ email: null }).mensaje, /correo debe ser un texto/);
});

test('la búsqueda separa el nombre de la forma sin formato del RUT, completo o parcial (RF-2)', () => {
  assert.deepEqual(interpretarBusqueda('12.345.678-5'), { texto: '12.345.678-5', rut: '12345678-5' });
  assert.deepEqual(interpretarBusqueda('12345678-5'), { texto: '12345678-5', rut: '12345678-5' });
  assert.deepEqual(interpretarBusqueda('  12.345 '), { texto: '12.345', rut: '12345' });
  assert.deepEqual(interpretarBusqueda('6.000.000-k'), { texto: '6.000.000-k', rut: '6000000-K' });
  assert.deepEqual(interpretarBusqueda('8-5'), { texto: '8-5', rut: '8-5' });
});

test('lo escrito que no puede ser parte de un RUT solo se busca como nombre (RF-2)', () => {
  assert.deepEqual(interpretarBusqueda('María  José'), { texto: 'María José', rut: null });
  assert.deepEqual(interpretarBusqueda('Kevin'), { texto: 'Kevin', rut: null });
  assert.deepEqual(interpretarBusqueda('K'), { texto: 'K', rut: null });
  assert.deepEqual(interpretarBusqueda(''), { texto: '', rut: null });
  assert.deepEqual(interpretarBusqueda(undefined), { texto: '', rut: null });
});

test('los comodines de LIKE escritos por la persona se buscan como texto (RF-2)', () => {
  assert.equal(escaparComodinesLike('100%'), '100\\%');
  assert.equal(escaparComodinesLike('a_b'), 'a\\_b');
  assert.equal(escaparComodinesLike('a\\b'), 'a\\\\b');
  assert.equal(escaparComodinesLike('Pedro'), 'Pedro');
});

test('el listado usa valores por defecto y ordena por deuda solo con el filtro "en deuda" (RF-3, RF-4)', () => {
  assert.deepEqual(validarFiltroListado(), { ok: true, estado: 'todos', orden: 'nombre', pagina: 1 });
  assert.deepEqual(validarFiltroListado({}), { ok: true, estado: 'todos', orden: 'nombre', pagina: 1 });
  assert.deepEqual(validarFiltroListado({ estado: 'deuda' }), { ok: true, estado: 'deuda', orden: 'deuda', pagina: 1 });
  assert.equal(validarFiltroListado({ estado: 'a_favor' }).orden, 'nombre');
  assert.equal(validarFiltroListado({ estado: 'deuda', orden: 'nombre' }).orden, 'nombre');
  assert.equal(validarFiltroListado({ estado: 'todos', orden: 'deuda' }).orden, 'deuda');
});

test('el listado acepta los cuatro estados y páginas enteras desde 1, también como texto (RF-3)', () => {
  for (const estado of ['todos', 'deuda', 'a_favor', 'al_dia']) {
    assert.equal(validarFiltroListado({ estado }).ok, true, estado);
  }
  assert.equal(validarFiltroListado({ pagina: '3' }).pagina, 3);
  assert.equal(validarFiltroListado({ pagina: 2 }).pagina, 2);
  assert.equal(validarFiltroListado({ estado: '', orden: '', pagina: '' }).ok, true);
});

test('el listado rechaza estados, órdenes y páginas inválidos (RF-3, RF-4)', () => {
  assert.match(validarFiltroListado({ estado: 'moroso' }).mensaje, /estado/);
  assert.match(validarFiltroListado({ orden: 'rut' }).mensaje, /orden/);
  for (const pagina of ['0', 0, '-1', '1.5', 'abc', -3]) {
    assert.match(validarFiltroListado({ pagina }).mensaje, /página/, `página ${String(pagina)}`);
  }
});
