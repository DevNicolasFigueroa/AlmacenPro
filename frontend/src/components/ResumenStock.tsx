// Franja con la cantidad de productos con stock bajo y agotados (spec 002, RF-33).
// Es igual para administrador y cajero y no incluye costos. Si no hay alertas, no se muestra.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { ResumenStock as Resumen } from '../types';
import '../styles/inventario.css';

export function ResumenStock() {
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    function cargar() {
      api.get<Resumen>('/productos/resumen-stock')
        .then(({ data }) => setResumen(data))
        // La franja es informativa: si falla, no se interrumpe el punto de venta.
        .catch(() => setResumen(null));
    }
    cargar();
    // Spec 003, RF-32: al confirmar una venta las marcas de stock se actualizan de inmediato.
    window.addEventListener('stock-cambiado', cargar);
    return () => window.removeEventListener('stock-cambiado', cargar);
  }, []);

  if (!resumen || (resumen.stockBajo === 0 && resumen.agotados === 0)) return null;

  return (
    <p role="status" className="resumen-stock">
      {resumen.stockBajo > 0 && (
        <Link to="/inventario?estado=bajo">
          <span className="resumen-punto" aria-hidden="true" />
          {resumen.stockBajo} {resumen.stockBajo === 1 ? 'producto con stock bajo' : 'productos con stock bajo'}
        </Link>
      )}
      {resumen.agotados > 0 && (
        <Link to="/inventario?estado=agotado">
          <span className="resumen-punto resumen-punto--agotado" aria-hidden="true" />
          {resumen.agotados} {resumen.agotados === 1 ? 'producto agotado' : 'productos agotados'}
        </Link>
      )}
    </p>
  );
}
