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
    api.get<{ ventas: VentaCancelada[] }>('/ventas?estado=cancelada_automaticamente&desde=2000-01-01&hasta=2099-12-31')
      .then(({ data }) => setVentas(data.ventas))
      .catch((err) => setError(mensajeError(err)))
      .finally(() => setCargando(false));
  }, []);

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Historial de ventas</h2>
          <p className="pagina-descripcion">
            Ventas que se cerraron solas tras 15 minutos sin actividad.
          </p>
        </div>
      </header>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}
      {cargando && <p className="pagina-descripcion">Cargando historial…</p>}

      {!cargando && ventas.length === 0 && !error && (
        <div className="vacio">
          <strong>No hay ventas canceladas automáticamente</strong>
          <p>Cuando una venta quede abandonada por 15 minutos, aparecerá aquí para que la revises.</p>
        </div>
      )}

      {ventas.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th className="numero">N.º</th>
                <th>Fecha</th>
                <th>Cajero</th>
                <th>Inactiva desde</th>
                <th>Cancelada</th>
                <th className="numero">Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id}>
                  <td className="numero">{venta.id}</td>
                  <td>{new Date(venta.fecha).toLocaleString('es-CL')}</td>
                  <td>{venta.cajero_nombre} <span className="nota-bloqueo">({venta.cajero_usuario})</span></td>
                  <td>{new Date(venta.ultima_actividad).toLocaleString('es-CL')}</td>
                  <td>{new Date(venta.cancelada_en).toLocaleString('es-CL')}</td>
                  <td className="numero">{formatoCLP.format(Number(venta.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
