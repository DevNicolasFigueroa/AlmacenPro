// Funciones puras para el RUT chileno (spec 003, RF-20, RNF-10).
// El RUT es el único identificador del cliente: se guarda sin puntos ("12345678-5",
// con K mayúscula) para que dos formas de escribirlo no creen dos clientes.
export const LARGO_MINIMO_CUERPO = 7;
export const LARGO_MAXIMO_CUERPO = 8;

// Quita puntos y espacios y separa el cuerpo del dígito verificador.
// Devuelve { cuerpo, dv } o null si la forma no corresponde a un RUT.
function separar(texto) {
  const limpio = String(texto ?? '').replace(/[.\s]/g, '').toUpperCase();
  const partes = /^(\d{1,9})-?([\dK])$/.exec(limpio);
  if (!partes) return null;
  return { cuerpo: partes[1].replace(/^0+/, ''), dv: partes[2] };
}

// Dígito verificador por módulo 11: pesos 2 a 7 de derecha a izquierda;
// el resultado 11 se escribe 0 y el 10 se escribe K.
function calcularDigito(cuerpo) {
  let suma = 0;
  let peso = 2;
  for (let posicion = cuerpo.length - 1; posicion >= 0; posicion -= 1) {
    suma += Number(cuerpo[posicion]) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

// RF-20: forma guardada del RUT ("12345678-5") o null si no tiene forma de RUT.
// No comprueba el dígito verificador: para eso está esRutValido.
export function normalizarRut(texto) {
  const partes = separar(texto);
  return partes ? `${partes.cuerpo}-${partes.dv}` : null;
}

// RF-20, RNF-10: de 7 u 8 dígitos y con el dígito verificador correcto.
export function esRutValido(texto) {
  const partes = separar(texto);
  if (!partes) return false;
  if (partes.cuerpo.length < LARGO_MINIMO_CUERPO || partes.cuerpo.length > LARGO_MAXIMO_CUERPO) {
    return false;
  }
  return calcularDigito(partes.cuerpo) === partes.dv;
}

// RNF-10: formato para mostrar ("12.345.678-5"); null si no tiene forma de RUT.
export function formatearRut(texto) {
  const partes = separar(texto);
  if (!partes) return null;
  const cuerpo = partes.cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${partes.dv}`;
}
