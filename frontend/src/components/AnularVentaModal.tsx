// Anulación de una venta confirmada (spec 003, RF-42–48): solo el administrador, con motivo
// obligatorio y sin límite de tiempo. El stock vuelve y, si fue fiado, se descuenta la deuda;
// si el cliente ya había abonado, el saldo puede quedar a su favor.
import { useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import { formatearClp } from '../utils/formato';
import { Modal } from './Modal';
import type { DetalleVentaCompleto } from '../types';
import '../styles/ventas.css';

interface Props {
  venta: DetalleVentaCompleto;
  onAnulada: (mensaje: string) => void;
  onCerrar: () => void;
}

export function AnularVentaModal({ venta, onAnulada, onCerrar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function anular(evento: FormEvent) {
    evento.preventDefault();
    if (motivo.trim() === '') {
      setError('Escribe el motivo de la anulación');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post<{ mensaje: string }>(`/ventas/${venta.id}/anular`, { motivo });
      onAnulada(data.mensaje);
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Anular venta" idTitulo="titulo-anular-venta"
      subtitulo={`Venta n.º ${venta.id} por ${formatearClp(venta.total)}`} onCerrar={onCerrar}>
      <form onSubmit={anular}>
        <ul className="anular-efectos">
          <li>El stock de los productos vendidos vuelve al inventario.</li>
          {venta.metodo_pago === 'fiado' && (
            <li>
              Se descuentan {formatearClp(venta.total)} de la deuda de{' '}
              {venta.cliente_nombre ?? venta.cliente_rut_formateado}. Si ya había abonado, queda saldo a su favor.
            </li>
          )}
          <li>La venta sigue en el historial, marcada como anulada. No se puede deshacer.</li>
        </ul>

        <label className="campo">
          Motivo de la anulación
          <textarea value={motivo} maxLength={255} rows={3} autoFocus
            onChange={(e) => { setMotivo(e.target.value); setError(''); }}
            placeholder="Por ejemplo: se cobró dos veces" />
        </label>
        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton boton--peligro" disabled={enviando}>
            {enviando ? 'Anulando…' : 'Anular venta'}
          </button>
          <button type="button" className="boton boton--secundario" disabled={enviando} onClick={onCerrar}>
            Volver
          </button>
        </div>
      </form>
    </Modal>
  );
}
