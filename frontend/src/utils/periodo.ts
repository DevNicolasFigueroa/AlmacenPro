// Período de los reportes (spec 005, RF-8): fechas 'AAAA-MM-DD' en hora local, hoy por defecto,
// con atajos y la misma validación que hace el servidor (la que manda es la del servidor).
import { diaLocal } from './formato';

export interface Periodo {
  desde: string;
  hasta: string;
}

export const MAXIMO_DIAS_PERIODO = 366;

export function periodoDeHoy(ahora = new Date()): Periodo {
  const hoy = diaLocal(ahora);
  return { desde: hoy, hasta: hoy };
}

function aFecha(texto: string) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

export const ATAJOS_PERIODO: { clave: string; texto: string; calcular: (ahora: Date) => Periodo }[] = [
  { clave: 'hoy', texto: 'Hoy', calcular: (ahora) => periodoDeHoy(ahora) },
  {
    clave: 'ayer',
    texto: 'Ayer',
    calcular: (ahora) => {
      const ayer = diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1));
      return { desde: ayer, hasta: ayer };
    },
  },
  {
    clave: 'semana',
    texto: 'Esta semana',
    calcular: (ahora) => {
      // La semana empieza el lunes.
      const atras = (ahora.getDay() + 6) % 7;
      return {
        desde: diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - atras)),
        hasta: diaLocal(ahora),
      };
    },
  },
  {
    clave: 'mes',
    texto: 'Este mes',
    calcular: (ahora) => ({
      desde: diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1)),
      hasta: diaLocal(ahora),
    }),
  },
];

// Devuelve el mensaje que dice qué corregir, o null si el período es válido.
export function validarPeriodo({ desde, hasta }: Periodo): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return 'Elige las dos fechas del período';
  }
  const inicio = aFecha(desde);
  const fin = aFecha(hasta);
  if (inicio.getTime() > fin.getTime()) return 'La fecha "desde" no puede ser posterior a la fecha "hasta"';
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
  if (dias > MAXIMO_DIAS_PERIODO) return 'El período puede ser de hasta un año: acorta las fechas';
  return null;
}
