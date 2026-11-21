// RUT chileno en la interfaz (spec 003, RF-20, RNF-10).
// Solo ayuda a escribir y a avisar a tiempo: la validación que manda es la del backend.

// Dígito verificador por módulo 11: pesos 2 a 7 de derecha a izquierda; 11 se escribe 0 y 10 K.
function calcularDigito(cuerpo: string): string {
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

function separar(texto: string): { cuerpo: string; dv: string } | null {
  const limpio = texto.replace(/[.\s]/g, '').toUpperCase();
  const partes = /^(\d{1,9})-?([\dK])$/.exec(limpio);
  return partes ? { cuerpo: partes[1].replace(/^0+/, ''), dv: partes[2] } : null;
}

// Forma que guarda el sistema: "12345678-5" (sin puntos, K mayúscula). Null si no tiene forma de RUT.
export function normalizarRut(texto: string): string | null {
  const partes = separar(texto);
  return partes ? `${partes.cuerpo}-${partes.dv}` : null;
}

// De 7 u 8 dígitos y con el dígito verificador correcto.
export function esRutValido(texto: string): boolean {
  const partes = separar(texto);
  if (!partes || partes.cuerpo.length < 7 || partes.cuerpo.length > 8) return false;
  return calcularDigito(partes.cuerpo) === partes.dv;
}

// Para mostrar: "12.345.678-5". Si no tiene forma de RUT devuelve el texto tal cual.
export function formatearRut(texto: string): string {
  const partes = separar(texto);
  if (!partes) return texto;
  return `${partes.cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${partes.dv}`;
}

// Da formato mientras se escribe: el último carácter es el dígito verificador.
export function formatearAlEscribir(texto: string): string {
  const limpio = texto.replace(/[^\dkK]/g, '').toUpperCase().slice(0, 9);
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}
