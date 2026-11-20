// Franja con la cantidad de productos con stock bajo y agotados (spec 002, RF-33).
// Es igual para administrador y cajero y no incluye costos. Si no hay alertas, no se muestra.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { ResumenStock as Resumen } from '../types';

export function ResumenStock() {
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    api.get<Resumen>('/productos/resumen-stock')
      .then(({ data }) => setResumen(data))
      // La franja es informativa: si falla, no se interrumpe el punto de venta.
      .catch(() => setResumen(null));
  }, []);

  if (!resumen || (resumen.stockBajo === 0 && resumen.agotados === 0)) return null;

  return (
    <p role="status" className="resumen-stock">
      {resumen.stockBajo > 0 && (
        <Link to="/inventario?estado=bajo">
          {resumen.stockBajo} {resumen.stockBajo === 1 ? 'producto con stock bajo' : 'productos con stock bajo'}
        </Link>
      )}
      {resumen.agotados > 0 && (
        <Link to="/inventario?estado=agotado">
          {resumen.agotados} {resumen.agotados === 1 ? 'producto agotado' : 'productos agotados'}
        </Link>
      )}
    </p>
  );
}
