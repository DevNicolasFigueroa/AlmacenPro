// Etiqueta con el estado de una venta cerrada (spec 003, RF-35). El color nunca es lo único que
// informa: el texto dice qué pasó con la venta.
import type { EstadoVenta } from '../types';

const ETIQUETAS: Record<EstadoVenta, { texto: string; clase: string }> = {
  en_curso: { texto: 'En curso', clase: 'chip--apagado' },
  completada: { texto: 'Completada', clase: '' },
  anulada: { texto: 'Anulada', clase: 'chip--peligro' },
  cancelada: { texto: 'Cancelada', clase: 'chip--apagado' },
  cancelada_automaticamente: { texto: 'Cancelada por inactividad', clase: 'chip--alerta' },
};

export function EtiquetaEstadoVenta({ estado }: { estado: EstadoVenta }) {
  const { texto, clase } = ETIQUETAS[estado];
  return <span className={`chip ${clase}`.trim()}>{texto}</span>;
}
