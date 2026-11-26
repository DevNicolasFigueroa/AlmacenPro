// Cifra de stock con una regleta que marca el mínimo del producto (spec 002, RF-31).
// La marca vertical es el mínimo: si el relleno no la alcanza, hay que reponer.
// El color nunca es lo único que informa: la etiqueta de estado va junto a la cifra.
import type { ReactNode } from 'react';
import { formatearCantidad } from '../utils/formato';
import type { Producto } from '../types';
import '../styles/inventario.css';

interface Props {
  producto: Producto;
  etiqueta?: ReactNode; // etiqueta de estado que acompaña a la cifra
}

export function MedidorStock({ producto, etiqueta }: Props) {
  const { stock, stock_minimo: minimo, unidad_medida: unidad, estado_stock: estado } = producto;

  // La escala deja siempre espacio a la derecha del mínimo para ver cuánto sobra.
  const tope = Math.max(stock, minimo * 2, 1);
  const relleno = Math.min(100, (stock / tope) * 100);
  const marca = minimo > 0 ? Math.min(100, (minimo / tope) * 100) : null;

  const descripcion = minimo > 0
    ? `Stock ${formatearCantidad(stock, unidad)}. Mínimo ${formatearCantidad(minimo, unidad)}`
    : `Stock ${formatearCantidad(stock, unidad)}. Sin mínimo definido`;

  return (
    <div className={`medidor medidor--${estado}`}>
      <div className="stock-linea">
        <span className="medidor-cifra">{formatearCantidad(stock, unidad)}</span>
        {etiqueta}
      </div>
      {marca !== null && (
        <div className="medidor-regleta" role="img" aria-label={descripcion}>
          <span className="medidor-relleno" style={{ width: `${relleno}%` }} />
          <span className="medidor-marca" style={{ left: `${marca}%` }} />
        </div>
      )}
      <span className="medidor-minimo">
        {minimo > 0 ? `Mínimo ${formatearCantidad(minimo, unidad)}` : 'Sin mínimo definido'}
      </span>
    </div>
  );
}
