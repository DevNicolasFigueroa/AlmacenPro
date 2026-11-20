// Formato de montos y cantidades para la interfaz (spec 002, RNF-4).
import type { UnidadMedida } from '../types';

// Montos en pesos chilenos, sin decimales: $1.490
export function formatearClp(valor: string | number | undefined) {
  return Number(valor ?? 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });
}

// Kilos con coma decimal ("2,5 kg") y unidades enteras ("12 u.").
export function formatearCantidad(valor: number, unidad: UnidadMedida) {
  if (unidad === 'kilo') {
    return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 3 })} kg`;
  }
  return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })} u.`;
}

export type ResultadoCantidad = { valor: number } | { error: string };

// Convierte el texto escrito por la persona (acepta coma decimal) en número.
// Solo ayuda a avisar en pantalla: la validación que manda es la del backend.
export function parsearCantidad(texto: string, unidad: UnidadMedida): ResultadoCantidad {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) {
    return { error: 'Escribe un número, por ejemplo 2,5' };
  }
  const valor = Number(limpio);
  if (unidad === 'unidad' && !Number.isInteger(valor)) {
    return { error: 'Este producto se cuenta por unidad: usa un número entero' };
  }
  if (unidad === 'kilo' && Math.abs(Math.round(valor * 1000) / 1000 - valor) > 1e-9) {
    return { error: 'Los kilos admiten hasta 3 decimales' };
  }
  return { valor };
}
