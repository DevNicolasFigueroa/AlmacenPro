// Formato de montos y cantidades para la interfaz (spec 002, RNF-4).
import type { UnidadMedida } from '../types';

// Montos en pesos chilenos, sin decimales: $1.490
export function formatearClp(valor: string | number | undefined) {
  const numero = Number(valor ?? 0);
  const texto = Math.abs(numero).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });
  // El signo va antes del símbolo: -$300 (y no $-300), por ejemplo en un margen negativo.
  return numero < 0 ? `-${texto}` : texto;
}

// Acepta lo que escribe la persona ("1490", "1.490", "$1.490") y devuelve el entero en pesos.
// Con decimales o texto devuelve NaN: los precios en CLP no llevan decimales.
export function parsearMonto(texto: string): number {
  const limpio = texto.replace(/[\s$.]/g, '');
  return /^\d+$/.test(limpio) ? Number(limpio) : NaN;
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

// Fecha y hora como las muestra el almacén: "21-11-2026 15:30". Las fechas llegan como
// 'AAAA-MM-DD HH:mm:ss' en hora local del servidor.
export function formatearFechaHora(texto: string | null | undefined) {
  if (!texto) return '';
  const fecha = new Date(texto.replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return texto;
  return fecha.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

// 'AAAA-MM-DD' del día local, para los filtros por fecha.
export function diaLocal(fecha: Date) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export const NOMBRE_METODO_PAGO = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
} as const;

// Cómo pagó el cliente un abono (spec 004, RF-10).
export const NOMBRE_METODO_ABONO = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia',
} as const;

// Nombre de cada movimiento de la cuenta de fiado.
export const NOMBRE_MOVIMIENTO_FIADO = {
  cargo: 'Cargo por venta',
  abono: 'Abono',
  anulacion: 'Anulación de venta',
  anulacion_abono: 'Anulación de abono',
} as const;
