// Detalle de una venta ya cerrada (spec 003, RF-38, RF-39): productos con su precio congelado,
// total, método, cliente y cajero; en anuladas, quién, cuándo y por qué; en canceladas, la causa
// y el carrito, dejando claro que no afectaron el stock ni la deuda. Solo administrador.
import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import {
  NOMBRE_METODO_PAGO, formatearCantidad, formatearClp, formatearFechaHora,
} from '../utils/formato';
import { AnularVentaModal } from './AnularVentaModal';
import { EtiquetaEstadoVenta } from './EtiquetaEstadoVenta';
import { Modal } from './Modal';
import type { DetalleVentaCompleto } from '../types';
import '../styles/ventas.css';

interface Props {
  ventaId: number;
  // Se llama al anular, para que la pantalla de origen se actualice y muestre el aviso.
  onAnulada?: (mensaje: string) => void;
  onCerrar: () => void;
}

export function DetalleVentaModal({ ventaId, onAnulada, onCerrar }: Props) {
  const [venta, setVenta] = useState<DetalleVentaCompleto | null>(null);
  const [error, setError] = useState('');
  const [anulando, setAnulando] = useState(false);

  const cargar = useCallback(() => {
    api.get<DetalleVentaCompleto>(`/ventas/${ventaId}`)
      .then(({ data }) => setVenta(data))
      .catch((err) => setError(mensajeError(err)));
  }, [ventaId]);

  useEffect(() => { cargar(); }, [cargar]);

  if (anulando && venta) {
    return (
      <AnularVentaModal venta={venta} onCerrar={() => setAnulando(false)}
        onAnulada={(mensaje) => { setAnulando(false); onAnulada?.(mensaje); cargar(); }} />
    );
  }

  const cancelada = venta?.estado === 'cancelada' || venta?.estado === 'cancelada_automaticamente';
  const cliente = venta?.cliente_nombre ?? venta?.cliente_rut_formateado;

  return (
    <Modal titulo={`Venta n.º ${ventaId}`} idTitulo="titulo-detalle-venta"
      subtitulo={venta ? formatearFechaHora(venta.fecha) : undefined} onCerrar={onCerrar}>
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}
      {!venta && !error && <p className="pagina-descripcion">Cargando la venta…</p>}

      {venta && (
        <>
          <div className="detalle-estado">
            <EtiquetaEstadoVenta estado={venta.estado} />
            <strong className="detalle-total">{formatearClp(venta.total)}</strong>
          </div>

          <dl className="detalle-datos">
            <div><dt>Cajero</dt><dd>{venta.cajero_nombre}</dd></div>
            {venta.metodo_pago && <div><dt>Método de pago</dt><dd>{NOMBRE_METODO_PAGO[venta.metodo_pago]}</dd></div>}
            <div>
              <dt>Cliente</dt>
              <dd>
                {cliente
                  ? <>{cliente}{venta.cliente_nombre && <span className="nota-bloqueo"> {venta.cliente_rut_formateado}</span>}</>
                  : 'Sin cliente asociado'}
              </dd>
            </div>
          </dl>

          {venta.estado === 'anulada' && (
            <div className="alerta alerta--error detalle-bloque">
              <strong>Anulada por {venta.anulada_por_nombre} el {formatearFechaHora(venta.anulada_en)}</strong>
              <p>Motivo: {venta.motivo_anulacion}</p>
            </div>
          )}

          {cancelada && (
            <div className="alerta alerta--aviso detalle-bloque">
              <strong>
                {venta.estado === 'cancelada_automaticamente'
                  ? 'Se canceló sola tras 15 minutos sin actividad.'
                  : 'La persona que vendía la canceló.'}
              </strong>
              <p>
                Inició {formatearFechaHora(venta.iniciada_en)}
                {venta.cancelada_en && <> y se cerró {formatearFechaHora(venta.cancelada_en)}</>}.
                No afectó el stock ni la deuda de nadie.
              </p>
            </div>
          )}

          <h4 className="detalle-subtitulo">{cancelada ? 'Carrito al cancelar' : 'Productos'}</h4>
          {venta.lineas.length === 0 ? (
            <p className="pagina-descripcion">El carrito estaba vacío.</p>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="numero">Cantidad</th>
                    <th className="numero">Precio</th>
                    <th className="numero">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {venta.lineas.map((linea) => (
                    <tr key={linea.producto_id}>
                      <td>{linea.nombre}</td>
                      <td className="numero">{formatearCantidad(linea.cantidad, linea.unidad_medida)}</td>
                      <td className="numero">{formatearClp(linea.precio_unitario)}</td>
                      <td className="numero">{formatearClp(linea.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="acciones">
            {venta.estado === 'completada' && (
              <button type="button" className="boton boton--peligro" onClick={() => setAnulando(true)}>
                Anular venta
              </button>
            )}
            <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cerrar</button>
          </div>
        </>
      )}
    </Modal>
  );
}
