// Historial de movimientos de stock de un producto, solo lectura (spec 002, RF-28, RF-29).
import { useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import { formatearCantidad } from '../utils/formato';
import { Modal } from './Modal';
import type { MovimientoStock, Producto, TipoMovimiento } from '../types';

interface Props {
  producto: Producto;
  onCerrar: () => void;
}

const NOMBRE_MOTIVO: Record<TipoMovimiento, string> = {
  stock_inicial: 'Stock inicial',
  merma: 'Merma',
  reposicion: 'Reposición',
  correccion: 'Corrección',
  venta: 'Venta',
  anulacion_venta: 'Anulación de venta',
};

// MySQL entrega la fecha como 'YYYY-MM-DD HH:mm:ss' en hora local del servidor.
function formatearFecha(valor: string) {
  const fecha = new Date(valor.replace(' ', 'T'));
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleString('es-CL');
}

export function HistorialStockModal({ producto, onCerrar }: Props) {
  const [movimientos, setMovimientos] = useState<MovimientoStock[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<MovimientoStock[]>(`/productos/${producto.id}/movimientos`)
      .then(({ data }) => setMovimientos(data))
      .catch((err) => setError(mensajeError(err)));
  }, [producto.id]);

  return (
    <Modal titulo="Historial de stock" idTitulo="titulo-historial" onCerrar={onCerrar}>
      <p><strong>{producto.nombre}</strong></p>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}
      {!movimientos && !error && <p>Cargando…</p>}
      {movimientos && movimientos.length === 0 && (
        <p className="ayuda">Este producto aún no tiene movimientos de stock.</p>
      )}

      {movimientos && movimientos.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Motivo</th>
                <th className="numero">Cantidad</th>
                <th className="numero">Stock</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{formatearFecha(m.creado_en)}</td>
                  <td>{m.usuario_nombre}</td>
                  <td>{NOMBRE_MOTIVO[m.tipo]}</td>
                  <td className="numero">
                    {m.cantidad > 0 ? '+' : ''}{formatearCantidad(m.cantidad, producto.unidad_medida)}
                  </td>
                  <td className="numero">
                    {formatearCantidad(m.stock_antes, producto.unidad_medida)}
                    {' → '}
                    {formatearCantidad(m.stock_despues, producto.unidad_medida)}
                  </td>
                  <td>{m.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cerrar</button>
      </div>
    </Modal>
  );
}
