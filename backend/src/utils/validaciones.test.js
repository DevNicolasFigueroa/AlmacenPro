// Pruebas unitarias de las decisiones puras de la spec 001 (sin base de datos ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  credencialesCompletas,
  debeCambiarContrasena,
  esContrasenaValida,
  esIdentificadorValido,
  esRutaDeVentaEnCurso,
  esRolValido,
  estadoDeBloqueo,
  estadoInactividadVenta,
  normalizarIdentificador,
  puedeCerrarSesion,
  puedeDesactivar,
  puedeRecuperarAdministrador,
  puedeRestablecer,
  segundosParaCancelar,
  sesionAceptable,
  siguienteIntento,
} from './validaciones.js';

const hoy = new Date('2026-01-01T12:00:00.000Z');

test('credenciales vacías o con espacios se rechazan (RF-3)', () => {
  assert.equal(credencialesCompletas('  ', 'clave'), false);
  assert.equal(credencialesCompletas('admin', ''), false);
  assert.equal(credencialesCompletas('admin', '   '), false);
  assert.equal(credencialesCompletas(null, undefined), false);
  assert.equal(credencialesCompletas('admin', 'clave'), true);
});

test('solo existen los dos roles definidos (RF-18)', () => {
  assert.equal(esRolValido('administrador'), true);
  assert.equal(esRolValido('cajero'), true);
  assert.equal(esRolValido('gerente'), false);
  assert.equal(esRolValido(null), false);
});

test('el identificador se recorta y rechaza vacíos o espacios internos (RF-18, RF-19)', () => {
  assert.equal(normalizarIdentificador('  admin  '), 'admin');
  assert.equal(normalizarIdentificador('cajero.1'), 'cajero.1');
  assert.equal(normalizarIdentificador('  '), '');
  assert.equal(normalizarIdentificador('ad min'), '');
  assert.equal(normalizarIdentificador(null), '');
});

test('el identificador exige entre 3 y 50 caracteres válidos (RF-18, RF-19)', () => {
  assert.equal(esIdentificadorValido('admin'), true);
  assert.equal(esIdentificadorValido('  admin  '), true);
  assert.equal(esIdentificadorValido('ab'), false);
  assert.equal(esIdentificadorValido('a'.repeat(50)), true);
  assert.equal(esIdentificadorValido('a'.repeat(51)), false);
  assert.equal(esIdentificadorValido('con espacio'), false);
  assert.equal(esIdentificadorValido('usuario.1'), true);
  assert.equal(esIdentificadorValido('usuario-1'), true);
  assert.equal(esIdentificadorValido('usuario_1'), true);
  assert.equal(esIdentificadorValido('usuario@1'), false);
  assert.equal(esIdentificadorValido(''), false);
});

test('la contraseña exige 8 caracteres y no puede ser igual al usuario (RF-20, RF-28)', () => {
  assert.equal(esContrasenaValida('corta'), false);
  assert.equal(esContrasenaValida('        '), false);
  assert.equal(esContrasenaValida('contraseña123'), true);
  assert.equal(esContrasenaValida('admin123', 'admin'), true);
  assert.equal(esContrasenaValida('admin', 'admin'), false);
  assert.equal(esContrasenaValida('  Admin  ', 'admin'), false);
  assert.equal(esContrasenaValida('cajero123', 'admin'), true);
});

test('la cuenta permanece bloqueada hasta vencidos los 15 minutos (RF-4, RF-5)', () => {
  const hasta = new Date('2026-01-01T12:15:00.000Z');
  assert.deepEqual(estadoDeBloqueo(5, hasta, hoy), { bloqueado: true, minutosRestantes: 15 });
  assert.deepEqual(
    estadoDeBloqueo(5, new Date('2026-01-01T12:00:30.000Z'), hoy),
    { bloqueado: true, minutosRestantes: 1 }
  );
  assert.deepEqual(
    estadoDeBloqueo(5, new Date('2026-01-01T11:59:59.000Z'), hoy),
    { bloqueado: false, minutosRestantes: 0 }
  );
  assert.deepEqual(estadoDeBloqueo(0, null, hoy), { bloqueado: false, minutosRestantes: 0 });
});

test('el quinto intento fallido bloquea 15 minutos y el éxito reinicia (RF-4, RF-6)', () => {
  assert.deepEqual(siguienteIntento(3, false, hoy), {
    intentos: 4,
    bloqueadoHasta: null,
  });
  assert.deepEqual(siguienteIntento(4, false, hoy), {
    intentos: 5,
    bloqueadoHasta: new Date('2026-01-01T12:15:00.000Z'),
  });
  assert.deepEqual(siguienteIntento(5, true, hoy), { intentos: 0, bloqueadoHasta: null });
});

test('la sesión vencida solo se acepta si hay venta en curso (RF-33, RF-36, RF-37)', () => {
  const expira = new Date('2026-01-01T12:00:00.000Z');
  assert.equal(sesionAceptable(expira, hoy, false), 'expirada');
  assert.equal(sesionAceptable(expira, hoy, true), 'gracia_venta');
  assert.equal(sesionAceptable(new Date('2026-01-01T12:00:01.000Z'), hoy, false), 'vigente');
});

test('el cierre manual se bloquea solo durante una venta (RF-35)', () => {
  assert.equal(puedeCerrarSesion(true), false);
  assert.equal(puedeCerrarSesion(false), true);
});

test('un administrador solo se desactiva si queda otro activo (RF-26)', () => {
  assert.equal(puedeDesactivar('cajero', true, 5), true);
  assert.equal(puedeDesactivar('cajero', true, 0), true);
  assert.equal(puedeDesactivar('administrador', true, 2), true);
  assert.equal(puedeDesactivar('administrador', true, 1), false);
  assert.equal(puedeDesactivar('administrador', false, 1), true);
});

test('restablecer la contraseña de un administrador exige otro activo (RF-27)', () => {
  assert.equal(puedeRestablecer('cajero', true, 1), true);
  assert.equal(puedeRestablecer('administrador', true, 2), true);
  assert.equal(puedeRestablecer('administrador', true, 1), false);
  assert.equal(puedeRestablecer('administrador', false, 1), true);
});

test('el aviso es a los 10 minutos y la cancelación a los 15 (RF-38)', () => {
  const ultima = new Date('2026-01-01T11:45:00.000Z');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T11:54:59.000Z')), 'activa');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T11:55:00.000Z')), 'advertir');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T11:59:59.000Z')), 'advertir');
  assert.equal(estadoInactividadVenta(ultima, new Date('2026-01-01T12:00:00.000Z')), 'cancelar');
  assert.equal(estadoInactividadVenta(null, hoy), 'cancelar');
});

test('la cuenta regresiva nunca es negativa (RF-38)', () => {
  const ultima = new Date('2026-01-01T11:45:00.000Z');
  assert.equal(segundosParaCancelar(ultima, hoy), 0);
  assert.equal(segundosParaCancelar(ultima, new Date('2026-01-01T11:50:00.000Z')), 600);
  assert.equal(segundosParaCancelar(null, hoy), 0);
});

test('solo un administrador con código vigente puede recuperar (RF-29, RF-31)', () => {
  assert.equal(puedeRecuperarAdministrador('administrador', true, true), true);
  assert.equal(puedeRecuperarAdministrador('administrador', false, true), false);
  assert.equal(puedeRecuperarAdministrador('administrador', true, false), false);
  assert.equal(puedeRecuperarAdministrador('cajero', true, true), false);
});

test('la contraseña temporal bloquea el resto de funciones (RF-22)', () => {
  assert.equal(debeCambiarContrasena(true, '/api/ventas'), true);
  assert.equal(debeCambiarContrasena(true, '/api/auth/cambiar-contrasena'), false);
  assert.equal(debeCambiarContrasena(true, '/api/auth/logout'), false);
  assert.equal(debeCambiarContrasena(false, '/api/ventas'), false);
});

test('una cuenta desactivada solo puede terminar su venta (RF-38; spec 003 RF-1)', () => {
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/7/confirmar'), true);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/7/cancelar'), true);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/ventas/7/confirmar'), false);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/7/finalizar'), false); // ya no existe
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/en-curso'), false);
});

test('terminar la venta permite ver el carrito, editarlo y buscar clientes y productos (spec 003)', () => {
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/ventas/en-curso'), true);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/7/actividad'), true);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/7/lineas'), true);
  assert.equal(esRutaDeVentaEnCurso('PATCH', '/api/ventas/7/lineas/12'), true);
  assert.equal(esRutaDeVentaEnCurso('DELETE', '/api/ventas/7/lineas/12'), true);
  assert.equal(esRutaDeVentaEnCurso('DELETE', '/api/ventas/7/lineas'), true);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/productos/vendibles'), true);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/clientes/rut/12345678-5'), true);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/clientes'), true);
});

test('una cuenta desactivada no puede ver cuentas de clientes, abonar ni editar clientes (spec 004)', () => {
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/clientes'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/clientes/5/cuenta'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/clientes/5/compras/9'), false);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/clientes/5/abonos'), false);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/clientes/5/abonos/3/anular'), false);
  assert.equal(esRutaDeVentaEnCurso('PATCH', '/api/clientes/5'), false);
  assert.equal(esRutaDeVentaEnCurso('PATCH', '/api/clientes/5/rut'), false);
});

test('una cuenta desactivada no puede ver reportes ni cerrar su turno de caja (spec 005)', () => {
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/reportes/ventas'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/reportes/ganancias'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/reportes/mas-vendidos'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/reportes/por-reponer'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/cierres-caja'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/cierres-caja/turno'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/cierres-caja/sin-cerrar'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/cierres-caja/7'), false);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/cierres-caja'), false);
});

test('una cuenta desactivada no puede iniciar otra venta ni usar rutas de gestión (spec 003)', () => {
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/iniciar'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/ventas'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/ventas/7'), false);
  assert.equal(esRutaDeVentaEnCurso('POST', '/api/ventas/7/anular'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/clientes/7/cuenta'), false);
  assert.equal(esRutaDeVentaEnCurso('GET', '/api/productos'), false);
});
