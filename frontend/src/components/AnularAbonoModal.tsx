// Anular un abono mal registrado (spec 004, RF-16 a RF-18): solo el administrador, con motivo
// obligatorio y sin límite de tiempo. El abono no se borra: queda en la cuenta marcado como
// anulado y su monto vuelve a sumarse a la deuda.
import { useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import { NOMBRE_METODO_ABONO, formatearClp, formatearFechaHora } from '../utils/formato';
import { Modal } from './Modal';
import type { MovimientoFiado } from '../types';
import '../styles/ventas.css';

interface Props {
  clienteId: number;
  nombreCliente: string;
  abono: MovimientoFiado;
  onAnulado: (mensaje: string) => void;
  onCerrar: () => void;
}

export function AnularAbonoModal({ clienteId, nombreCliente, abono, onAnulado, onCerrar }: Props) {
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
      const { data } = await api.post<{ mensaje: string }>(
        `/clientes/${clienteId}/abonos/${abono.id}/anular`, { motivo }
      );
      onAnulado(data.mensaje);
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Anular abono" idTitulo="titulo-anular-abono"
      subtitulo={`${formatearClp(abono.monto)} de ${nombreCliente}`} onCerrar={onCerrar}>
      <form onSubmit={anular}>
        <ul className="anular-efectos">
          <li>
            Abono de {formatearClp(abono.monto)}
            {abono.metodo_pago && <> ({NOMBRE_METODO_ABONO[abono.metodo_pago]})</>} del{' '}
            {formatearFechaHora(abono.fecha)}, registrado por {abono.usuario_nombre}.
          </li>
          <li>Los {formatearClp(abono.monto)} vuelven a sumarse a la deuda del cliente.</li>
          <li>El abono sigue en la cuenta, marcado como anulado. No se puede deshacer.</li>
        </ul>

        <label className="campo">
          Motivo de la anulación
          <textarea value={motivo} maxLength={255} rows={3} autoFocus
            onChange={(e) => { setMotivo(e.target.value); setError(''); }}
            placeholder="Por ejemplo: se anotó dos veces" />
        </label>
        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton boton--peligro" disabled={enviando}>
            {enviando ? 'Anulando…' : 'Anular abono'}
          </button>
          <button type="button" className="boton boton--secundario" disabled={enviando} onClick={onCerrar}>
            Volver
          </button>
        </div>
      </form>
    </Modal>
  );
}
