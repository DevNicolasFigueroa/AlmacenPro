// Pruebas unitarias de las decisiones puras de la spec 001 (sin base de datos ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  credencialesCompletas,
  debeCambiarContrasena,
  esContrasenaValida,
  esRutaDeCierreDeVenta,
  esRolValido,
  estadoDeBloqueo,
  estadoInactividadVenta,
  puedeCerrarSesion,
  puedeDesactivar,
  puedeRecuperarAdministrador,
  segundosParaCancelar,
  sesionAceptable,
  siguienteIntento,
} from './validaciones.js';

const ahora = new Date('2026-01-01T12:00:00.000Z');

test('credenciales vacías o con espacios se rechazan (RF-3)', () => {
  assert.equal(credencialesCompletas('  ', 'clave'), false);
  assert.equal(credencialesCompletas('admin', ''), false);
  assert.equal(credencialesCompletas(null, undefined), false);
  assert.equal(credencialesCompletas('admin', 'clave'), true);
});

test('solo existen los dos roles definidos (RF-9, RF-10, RF-12)', () => {
  assert.equal(esRolValido('administrador'), true);
  assert.equal(esRolValido('cajero'), true);
  assert.equal(esRolValido('gerente'), false);
});

test('la contraseña debe tener al menos 8 caracteres (RF-12, RF-13)', () => {
  assert.equal(esContrasenaValida('corta'), false);
  assert.equal(esContrasenaValida('        '), false);
  assert.equal(esContrasenaValida('contraseña123'), true);
});

test('la cuenta permanece bloqueada hasta vencidos los 15 minutos (RF-7)', () => {
  const hasta = new Date('2026-01-01T12:15:00.000Z');
  assert.deepEqual(estadoDeBloqueo(5, hasta, ahora), { bloqueado: true, minutosRestantes: 15 });
  assert.deepEqual(
    estadoDeBloqueo(5, new Date('2026-01-01T12:00:30.000Z'), ahora),
    { bloqueado: true, minutosRestantes: 1 }
  );
  assert.deepEqual(
    estadoDeBloqueo(5, new Date('2026-01-01T11:59:59.000Z'), ahora),
    { bloqueado: false, minutosRestantes: 0 }
  );
});

test('el quinto intento fallido bloquea 15 minutos y el éxito reinicia (RF-7, RF-8)', () => {
  assert.deepEqual(siguienteIntento(3, false, ahora), {
    intentos: 4,
    bloqueadoHasta: null,
  });
  assert.deepEqual(siguienteIntento(4, false, ahora), {
    intentos: 5,
    bloqueadoHasta: new Date('2026-01-01T12:15:00.000Z'),
  });
  assert.deepEqual(siguienteIntento(5, true, ahora), { intentos: 0, bloqueadoHasta: null });
});

test('la sesión vencida solo se acepta si hay venta en curso (RF-26, RF-27)', () => {
  const expira = new Date('2026-01-01T12:00:00.000Z');
  assert.equal(sesionAceptable(expira, ahora, false), 'expirada');
  assert.equal(sesionAceptable(expira, ahora, true), 'gracia_venta');
  assert.equal(sesionAceptable(new Date('2026-01-01T12:00:01.000Z'), ahora, false), 'vigente');
});

test('el cierre manual se bloquea solo durante una venta (RF-22, RF-23)', () => {
  assert.equal(puedeCerrarSesion(true), false);
  assert.equal(puedeCerrarSesion(false), true);
});

test('los administradores nunca pueden desactivarse (RF-16)', () => {
  assert.equal(puedeDesactivar('cajero'), true);
  assert.equal(puedeDesactivar('administrador'), false);
});

test('el aviso es a los 10 minutos y la cancelación a los 15 (RF-24, RF-25)', () => {
  const ultima = new Date('2026-01-01T11:45:00.000Z');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T11:54:59.000Z')), 'activa');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T11:55:00.000Z')), 'advertir');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T11:59:59.000Z')), 'advertir');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T12:00:00.000Z')), 'cancelar');
});

test('la cuenta regresiva nunca es negativa (RF-24)', () => {
  const ultima = new Date('2026-01-01T11:45:00.000Z');
  assert.equal(segundosParaCancelar(ultima, ahora), 0);
  assert.equal(segundosParaCancelar(ultima, new Date('2026-01-01T11:50:00.000Z')), 600);
});

test('solo un administrador con código vigente puede recuperar (RF-20, RF-21)', () => {
  assert.equal(puedeRecuperarAdministrador('administrador', true, true), true);
  assert.equal(puedeRecuperarAdministrador('administrador', false, true), false);
  assert.equal(puedeRecuperarAdministrador('administrador', true, false), false);
  assert.equal(puedeRecuperarAdministrador('cajero', true, true), false);
});

test('la contraseña temporal bloquea el resto de funciones (RF-13)', () => {
  assert.equal(debeCambiarContrasena(true, '/api/ventas'), true);
  assert.equal(debeCambiarContrasena(true, '/api/auth/cambiar-contrasena'), false);
  assert.equal(debeCambiarContrasena(true, '/api/auth/logout'), false);
  assert.equal(debeCambiarContrasena(false, '/api/ventas'), false);
});

test('un cajero desactivado solo puede cerrar su venta (RF-15, RF-23)', () => {
  assert.equal(
    esRutaDeCierreDeVenta('POST', '/api/ventas/7/finalizar'),
    true
  );
  assert.equal(
    esRutaDeCierreDeVenta('POST', '/api/ventas/7/cancelar'),
    true
  );
  assert.equal(
    esRutaDeCierreDeVenta('GET', '/api/ventas/7/finalizar'),
    false
  );
  assert.equal(
    esRutaDeCierreDeVenta('POST', '/api/ventas/en-curso'),
    false
  );
});
