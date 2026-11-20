// Funciones puras de decisión del módulo de autenticación.
// Ninguna lee reloj, base de datos ni red: el tiempo llega en "ahora" como parámetro.
export const LIMITE_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
export const MINUTOS_AVISO = 10;
export const MINUTOS_CANCELACION = 15;
export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

function comoFecha(valor) {
  if (valor instanceof Date) return valor;
  if (!valor) return null;
  // MySQL con dateStrings devuelve 'YYYY-MM-DD HH:mm:ss'.
  return new Date(String(valor).replace(' ', 'T') + 'Z');
}

export function credencialesCompletas(usuario, password) {
  return Boolean(String(usuario ?? '').trim() && String(password ?? '').trim());
}

export function esRolValido(rol) {
  return rol === 'administrador' || rol === 'cajero';
}

export function esContrasenaValida(password) {
  return typeof password === 'string' && password.trim().length >= 8;
}

export function estadoDeBloqueo(intentos, bloqueadoHasta, ahora) {
  const hasta = comoFecha(bloqueadoHasta);
  if (hasta && hasta.getTime() > ahora.getTime()) {
    return {
      bloqueado: true,
      minutosRestantes: Math.max(1, Math.ceil((hasta.getTime() - ahora.getTime()) / 60000)),
    };
  }
  return { bloqueado: false, minutosRestantes: 0 };
}

export function siguienteIntento(intentos, exito, ahora) {
  if (exito) return { intentos: 0, bloqueadoHasta: null };
  const nuevos = Math.min(Number(intentos ?? 0) + 1, LIMITE_INTENTOS);
  return {
    intentos: nuevos,
    bloqueadoHasta: nuevos >= LIMITE_INTENTOS
      ? new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60000)
      : null,
  };
}

export function sesionAceptable(expiraEn, ahora, ventaEnCurso) {
  const expira = comoFecha(expiraEn);
  if (expira && ahora.getTime() < expira.getTime()) return 'vigente';
  return ventaEnCurso ? 'gracia_venta' : 'expirada';
}

export function puedeCerrarSesion(ventaEnCurso) {
  return !ventaEnCurso;
}

export function puedeDesactivar(rol) {
  return rol === 'cajero';
}

export function estadoInactividadVenta(ultimaActividad, ahora) {
  const ultima = comoFecha(ultimaActividad);
  if (!ultima) return 'cancelar';
  const minutos = (ahora.getTime() - ultima.getTime()) / 60000;
  if (minutos >= MINUTOS_CANCELACION) return 'cancelar';
  if (minutos >= MINUTOS_AVISO) return 'advertir';
  return 'activa';
}

export function segundosParaCancelar(ultimaActividad, ahora) {
  const ultima = comoFecha(ultimaActividad);
  if (!ultima) return 0;
  const limite = ultima.getTime() + MINUTOS_CANCELACION * 60000;
  return Math.max(0, Math.ceil((limite - ahora.getTime()) / 1000));
}

export function puedeRecuperarAdministrador(rol, tieneCodigo, coincide) {
  return rol === 'administrador' && Boolean(tieneCodigo) && Boolean(coincide);
}

export function debeCambiarContrasena(requiereCambio, ruta) {
  return Boolean(requiereCambio)
    && ruta !== '/api/auth/cambiar-contrasena'
    && ruta !== '/api/auth/logout';
}

export function esRutaDeCierreDeVenta(metodo, ruta) {
  return metodo === 'POST'
    && /^\/api\/ventas\/[^/]+\/(finalizar|cancelar)$/.test(ruta);
}
