// Funciones puras del cierre de caja (spec 005).
// Ninguna lee reloj, base de datos ni red.
import { formatearPesos } from './ventas.js';

export const MONTO_MAXIMO_EFECTIVO = 99_999_999;

// RF-17: el fondo inicial y el efectivo contado son pesos enteros de 0 o más. "nombre" es el
// texto del campo para que el mensaje diga qué corregir ("El efectivo contado ...").
export function validarEfectivo(valor, nombre) {
  let numero = NaN;
  if (typeof valor === 'number') {
    numero = valor;
  } else if (typeof valor === 'string' && valor.trim() !== '') {
    numero = /^-?\d+(\.\d+)?$/.test(valor.trim()) ? Number(valor.trim()) : NaN;
  }

  if (!Number.isFinite(numero)) {
    return { ok: false, mensaje: `Escribe ${nombre} en pesos` };
  }
  if (!Number.isInteger(numero)) {
    return { ok: false, mensaje: `${mayuscula(nombre)} debe ser en pesos enteros, sin decimales` };
  }
  if (numero < 0) {
    return { ok: false, mensaje: `${mayuscula(nombre)} no puede ser negativo` };
  }
  if (numero > MONTO_MAXIMO_EFECTIVO) {
    return { ok: false, mensaje: `${mayuscula(nombre)} puede ser como máximo ${formatearPesos(MONTO_MAXIMO_EFECTIVO)}` };
  }
  return { ok: true, monto: numero };
}

function mayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// RF-19, RF-20: efectivo esperado = fondo inicial + ventas en efectivo + abonos en efectivo
// menos el efectivo devuelto por anulaciones; diferencia = contado menos esperado (positiva es
// sobrante, negativa es faltante, cero la caja cuadra).
export function calcularCierre({
  fondoInicial, efectivoVentas, efectivoAbonos, efectivoDevuelto, efectivoContado,
}) {
  const efectivoEsperado = Math.round(Number(fondoInicial ?? 0))
    + Math.round(Number(efectivoVentas ?? 0))
    + Math.round(Number(efectivoAbonos ?? 0))
    - Math.round(Number(efectivoDevuelto ?? 0));
  const diferencia = Math.round(Number(efectivoContado ?? 0)) - efectivoEsperado;
  return {
    efectivoEsperado,
    diferencia,
    estado: diferencia === 0 ? 'cuadra' : diferencia > 0 ? 'sobra' : 'falta',
  };
}

// RF-20: el resultado como se lee en el mesón.
export function describirDiferencia(diferencia) {
  const valor = Math.round(Number(diferencia ?? 0));
  if (valor === 0) return 'La caja cuadra';
  if (valor > 0) return `Sobran ${formatearPesos(valor)}`;
  return `Faltan ${formatearPesos(-valor)}`;
}
