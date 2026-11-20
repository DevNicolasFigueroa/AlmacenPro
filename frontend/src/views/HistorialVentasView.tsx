// Historial de ventas canceladas automáticamente (spec 001, RF-28): solo administrador.
import { useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import type { VentaCancelada } from '../types';

const formatoCLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function VistaHistorialVentas() {
  const [ventas, setVentas] = useState<VentaCancelada[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get<VentaCancelada[]>('/ventas?estado=cancelada_automaticamente')
      .then(({ data }) => setVentas(data))
      .catch((err) => setError(mensajeError(err)))
      .finally(() => setCargando(false));
  }, []);

  return (
    <section>
      <h2>Ventas canceladas automáticamente</h2>
      {error && <p role="alert">{error}</p>}
      {cargando && <p>Cargando historial…</p>}
      {!cargando && ventas.length === 0 && <p>No hay ventas canceladas automáticamente.</p>}

      {ventas.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>N.º</th>
              <th>Fecha</th>
              <th>Cajero</th>
              <th>Inactiva desde</th>
              <th>Cancelada</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => (
              <tr key={venta.id}>
                <td>{venta.id}</td>
                <td>{new Date(venta.fecha).toLocaleString('es-CL')}</td>
                <td>{venta.cajero_nombre} ({venta.cajero_usuario})</td>
                <td>{new Date(venta.ultima_actividad).toLocaleString('es-CL')}</td>
                <td>{new Date(venta.cancelada_en).toLocaleString('es-CL')}</td>
                <td>{formatoCLP.format(Number(venta.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
