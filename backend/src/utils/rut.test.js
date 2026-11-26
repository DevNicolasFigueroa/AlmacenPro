// Pruebas unitarias del RUT chileno (spec 003, RF-20, RNF-10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { esRutValido, formatearRut, normalizarRut } from './rut.js';

test('se normaliza quitando puntos y espacios y con K mayúscula (RF-20)', () => {
  assert.equal(normalizarRut('12.345.678-5'), '12345678-5');
  assert.equal(normalizarRut(' 12345678-5 '), '12345678-5');
  assert.equal(normalizarRut('123456785'), '12345678-5');
  assert.equal(normalizarRut('6.000.000-k'), '6000000-K');
  assert.equal(normalizarRut('012345678-5'), '12345678-5');
});

test('lo que no tiene forma de RUT se normaliza a null (RF-20)', () => {
  for (const texto of ['', '   ', 'abc', '12345678-X', '12-34-5', '12.345.678-55', null, undefined]) {
    assert.equal(normalizarRut(texto), null, `texto ${String(texto)}`);
  }
});

test('un RUT con el dígito verificador correcto es válido, escrito de cualquier forma (RF-20)', () => {
  assert.equal(esRutValido('12.345.678-5'), true);
  assert.equal(esRutValido('12345678-5'), true);
  assert.equal(esRutValido('123456785'), true);
  assert.equal(esRutValido(' 12.345.678-5 '), true);
});

test('el dígito verificador K y 0 se calculan bien (RNF-10)', () => {
  assert.equal(esRutValido('6.000.000-K'), true);
  assert.equal(esRutValido('6000000-k'), true);
  assert.equal(esRutValido('14.000.000-0'), true);
  assert.equal(esRutValido('1.000.000-9'), true);
});

test('un dígito verificador incorrecto se rechaza (RNF-10)', () => {
  assert.equal(esRutValido('12.345.678-4'), false);
  assert.equal(esRutValido('12.345.678-K'), false);
  assert.equal(esRutValido('14.000.000-K'), false);
  // Sin guion, el último dígito se toma como verificador: aquí 1234567-8 no coincide.
  assert.equal(esRutValido('12.345.678'), false);
});

test('el cuerpo debe tener 7 u 8 dígitos (RF-20)', () => {
  assert.equal(esRutValido('1-9'), false);
  assert.equal(esRutValido('123456-4'), false);
  assert.equal(esRutValido('123456789-0'), false);
  assert.equal(esRutValido(''), false);
  assert.equal(esRutValido(null), false);
});

test('se muestra con puntos y guion, como 12.345.678-5 (RNF-10)', () => {
  assert.equal(formatearRut('12345678-5'), '12.345.678-5');
  assert.equal(formatearRut('123456785'), '12.345.678-5');
  assert.equal(formatearRut('6000000-k'), '6.000.000-K');
  assert.equal(formatearRut('texto'), null);
});
