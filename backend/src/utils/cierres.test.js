// Pruebas unitarias de las funciones puras del cierre de caja (spec 005).
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularCierre, describirDiferencia, validarEfectivo } from './cierres.js';

test('el efectivo es un entero en pesos de 0 o más, escrito como número o como texto (RF-17)', () => {
  assert.deepEqual(validarEfectivo(15000, 'el efectivo contado'), { ok: true, monto: 15000 });
  assert.deepEqual(validarEfectivo('15000', 'el efectivo contado'), { ok: true, monto: 15000 });
  assert.deepEqual(validarEfectivo(' 0 ', 'el fondo inicial'), { ok: true, monto: 0 });
  assert.deepEqual(validarEfectivo(99_999_999, 'el fondo inicial'), { ok: true, monto: 99_999_999 });
});

test('decimales, negativos, texto y vacío se rechazan diciendo qué corregir (RF-17)', () => {
  assert.match(validarEfectivo(1500.5, 'el efectivo contado').mensaje, /El efectivo contado debe ser en pesos enteros/);
  assert.match(validarEfectivo('1500.5', 'el efectivo contado').mensaje, /pesos enteros/);
  assert.match(validarEfectivo(-1, 'el fondo inicial').mensaje, /El fondo inicial no puede ser negativo/);
  assert.match(validarEfectivo('-500', 'el fondo inicial').mensaje, /no puede ser negativo/);
  assert.match(validarEfectivo('1.500', 'el efectivo contado').mensaje, /pesos enteros/); // se lee como 1,5
  for (const invalido of ['', '   ', 'abc', '12abc', null, undefined, NaN, Infinity, {}]) {
    const r = validarEfectivo(invalido, 'el efectivo contado');
    assert.equal(r.ok, false, `valor ${String(invalido)}`);
    assert.match(r.mensaje, /Escribe el efectivo contado en pesos/);
  }
});

test('un efectivo sobre el tope se rechaza con el tope en pesos chilenos (RF-17)', () => {
  const r = validarEfectivo(100_000_000, 'el efectivo contado');
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /\$99\.999\.999/);
});

test('el esperado es fondo más ventas en efectivo más abonos en efectivo menos lo devuelto (RF-19)', () => {
  const r = calcularCierre({
    fondoInicial: 20000, efectivoVentas: 35000, efectivoAbonos: 5000, efectivoDevuelto: 3000, efectivoContado: 57000,
  });
  assert.equal(r.efectivoEsperado, 57000);
  assert.equal(r.diferencia, 0);
  assert.equal(r.estado, 'cuadra');
});

test('si el contado es mayor al esperado sobra, y si es menor falta (RF-19, RF-20)', () => {
  const base = { fondoInicial: 10000, efectivoVentas: 20000, efectivoAbonos: 0, efectivoDevuelto: 0 };
  const sobra = calcularCierre({ ...base, efectivoContado: 31500 });
  assert.deepEqual([sobra.efectivoEsperado, sobra.diferencia, sobra.estado], [30000, 1500, 'sobra']);
  const falta = calcularCierre({ ...base, efectivoContado: 28000 });
  assert.deepEqual([falta.efectivoEsperado, falta.diferencia, falta.estado], [30000, -2000, 'falta']);
});

test('un cierre sin movimientos tiene como esperado el fondo inicial (caso límite)', () => {
  const r = calcularCierre({
    fondoInicial: 15000, efectivoVentas: 0, efectivoAbonos: 0, efectivoDevuelto: 0, efectivoContado: 15000,
  });
  assert.deepEqual([r.efectivoEsperado, r.diferencia, r.estado], [15000, 0, 'cuadra']);
  const vacio = calcularCierre({ efectivoContado: 0 });
  assert.deepEqual([vacio.efectivoEsperado, vacio.diferencia, vacio.estado], [0, 0, 'cuadra']);
});

test('las devoluciones pueden dejar un esperado menor que el fondo (RF-19)', () => {
  const r = calcularCierre({
    fondoInicial: 5000, efectivoVentas: 0, efectivoAbonos: 0, efectivoDevuelto: 3000, efectivoContado: 2000,
  });
  assert.deepEqual([r.efectivoEsperado, r.diferencia], [2000, 0]);
});

test('acepta montos como los entrega MySQL, en texto con decimales (RF-19)', () => {
  const r = calcularCierre({
    fondoInicial: '10000.00', efectivoVentas: '2500.00', efectivoAbonos: '500.00', efectivoDevuelto: '0.00', efectivoContado: 13000,
  });
  assert.deepEqual([r.efectivoEsperado, r.diferencia], [13000, 0]);
});

test('el resultado se lee como en el mesón: cuadra, sobran o faltan (RF-20)', () => {
  assert.equal(describirDiferencia(0), 'La caja cuadra');
  assert.equal(describirDiferencia(1500), 'Sobran $1.500');
  assert.equal(describirDiferencia(-12500), 'Faltan $12.500');
  assert.equal(describirDiferencia('2000.00'), 'Sobran $2.000');
});
