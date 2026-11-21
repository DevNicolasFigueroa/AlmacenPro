// Funciones puras de decisión del módulo de autenticación.
// Ninguna lee reloj, base de datos ni red: el tiempo llega en "hoy" como parámetro.
export const LIMITE_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
export const MINUTOS_AVISO = 10;
export const MINUTOS_CANCELACION = 15;
export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

export const LONGITUD_MINIMA_IDENTIFICADOR = 3;
export const LONGITUD_MAXIMA_IDENTIFICADOR = 50;
export const LONGITUD_MINIMA_CONTRASENA = 8;

function comoFecha(valor) {
  if (valor instanceof Date) return valor;
  if (!valor) return null;
  // MySQL con dateStrings devuelve 'YYYY-MM-DD HH:mm:ss' en hora local del servidor;
  // se interpreta como local porque los valores que se escriben (hoy = new Date())
  // también son hora local.
  return new Date(String(valor).replace(' ', 'T'));
}

// Recorta espacios externos y descarta identificadores vacíos o con espacios internos.
export function normalizarIdentificador(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto || /\s/.test(texto)) return '';
  return texto;
}

// Entre 3 y 50 caracteres: letras, números, punto, guion y guion bajo.
export function esIdentificadorValido(valor) {
  const texto = normalizarIdentificador(valor);
  return texto.length >= LONGITUD_MINIMA_IDENTIFICADOR
    && texto.length <= LONGITUD_MAXIMA_IDENTIFICADOR
    && /^[A-Za-z0-9._-]+$/.test(texto);
}

export function credencialesCompletas(usuario, contrasena) {
  return Boolean(String(usuario ?? '').trim() && String(contrasena ?? '').trim());
}

export function esRolValido(rol) {
  return rol === 'administrador' || rol === 'cajero';
}

// Mínimo 8 caracteres y distinta del identificador de la cuenta (sin distinguir mayúsculas).
export function esContrasenaValida(contrasena, usuario = '') {
  if (typeof contrasena !== 'string') return false;
  const texto = contrasena.trim();
  if (texto.length < LONGITUD_MINIMA_CONTRASENA) return false;

  const identificador = String(usuario ?? '').trim();
  if (!identificador) return true;
  return texto.toLowerCase() !== identificador.toLowerCase();
}

export function estadoDeBloqueo(intentos, bloqueadoHasta, hoy) {
  const hasta = comoFecha(bloqueadoHasta);
  if (hasta && hasta.getTime() > hoy.getTime()) {
    return {
      bloqueado: true,
      minutosRestantes: Math.max(1, Math.ceil((hasta.getTime() - hoy.getTime()) / 60000)),
    };
  }
  return { bloqueado: false, minutosRestantes: 0 };
}

export function siguienteIntento(intentos, exito, hoy) {
  if (exito) return { intentos: 0, bloqueadoHasta: null };
  const nuevos = Math.min(Number(intentos ?? 0) + 1, LIMITE_INTENTOS);
  return {
    intentos: nuevos,
    bloqueadoHasta: nuevos >= LIMITE_INTENTOS
      ? new Date(hoy.getTime() + MINUTOS_BLOQUEO * 60000)
      : null,
  };
}

export function sesionAceptable(expiraEn, hoy, ventaEnCurso) {
  const expira = comoFecha(expiraEn);
  if (expira && hoy.getTime() < expira.getTime()) return 'vigente';
  return ventaEnCurso ? 'gracia_venta' : 'expirada';
}

export function puedeCerrarSesion(ventaEnCurso) {
  return !ventaEnCurso;
}

// Un cajero siempre puede desactivarse. Un administrador solo si queda otro activo.
// Una cuenta ya inactiva puede volver a desactivarse sin riesgo.
export function puedeDesactivar(rolObjetivo, activoObjetivo = true, adminsActivos = 1) {
  if (!activoObjetivo) return true;
  if (rolObjetivo !== 'administrador') return true;
  return Number(adminsActivos) > 1;
}

// Restablecer la contraseña de un administrador activo exige que quede otro activo.
export function puedeRestablecer(rolObjetivo, activoObjetivo = true, adminsActivos = 1) {
  if (rolObjetivo !== 'administrador') return true;
  if (!activoObjetivo) return true;
  return Number(adminsActivos) > 1;
}

export function estadoInactividadVenta(ultimaActividad, hoy) {
  const ultima = comoFecha(ultimaActividad);
  if (!ultima) return 'cancelar';
  const minutos = (hoy.getTime() - ultima.getTime()) / 60000;
  if (minutos >= MINUTOS_CANCELACION) return 'cancelar';
  if (minutos >= MINUTOS_AVISO) return 'advertir';
  return 'activa';
}

export function segundosParaCancelar(ultimaActividad, hoy) {
  const ultima = comoFecha(ultimaActividad);
  if (!ultima) return 0;
  const limite = ultima.getTime() + MINUTOS_CANCELACION * 60000;
  return Math.max(0, Math.ceil((limite - hoy.getTime()) / 1000));
}

export function puedeRecuperarAdministrador(rol, tieneCodigo, coincide) {
  return rol === 'administrador' && Boolean(tieneCodigo) && Boolean(coincide);
}

export function debeCambiarContrasena(requiereCambio, ruta) {
  return Boolean(requiereCambio)
    && ruta !== '/api/auth/cambiar-contrasena'
    && ruta !== '/api/auth/logout';
}

// Spec 003: terminar una venta exige poder ver el carrito, buscar productos, identificar al
// cliente y confirmar o cancelar; por eso una cuenta desactivada con venta en curso puede usar
// estas rutas, pero no iniciar otra venta. "finalizar" se retira junto con su ruta (T7).
const RUTAS_VENTA_EN_CURSO = [
  ['GET', /^\/api\/ventas\/en-curso$/],
  ['POST', /^\/api\/ventas\/[^/]+\/(actividad|finalizar|confirmar|cancelar)$/],
  ['POST', /^\/api\/ventas\/[^/]+\/lineas$/],
  ['PATCH', /^\/api\/ventas\/[^/]+\/lineas\/[^/]+$/],
  ['DELETE', /^\/api\/ventas\/[^/]+\/lineas(\/[^/]+)?$/],
  ['GET', /^\/api\/productos\/vendibles$/],
  ['GET', /^\/api\/clientes\/rut\/[^/]+$/],
  ['POST', /^\/api\/clientes$/],
];

export function esRutaDeVentaEnCurso(metodo, ruta) {
  return RUTAS_VENTA_EN_CURSO.some(
    ([metodoPermitido, patron]) => metodo === metodoPermitido && patron.test(ruta)
  );
}
