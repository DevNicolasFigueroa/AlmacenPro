// Registrar un abono al fiado (spec 004, RF-10 a RF-14, RNF-1): monto, cómo pagó el cliente y una
// observación opcional. Mientras se escribe se ve el saldo que quedará; si el abono supera la deuda,
// se avisa cuánto queda a favor y se pide confirmar. El servidor decide con el saldo real, así que
// si cambió mientras se escribía, la pantalla se corrige y vuelve a pedir la confirmación.
// Al terminar muestra el resumen con el saldo resultante.
import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import {
  NOMBRE_METODO_ABONO, formatearClp, parsearMonto,
} from '../utils/formato';
import { Modal } from './Modal';
import type { EstadoCuenta, MetodoAbono } from '../types';
import '../styles/ventas.css';
import '../styles/clientes.css';

interface Props {
  clienteId: number;
  nombreCliente: string;
  saldo: number; // positivo = deuda; negativo = saldo a favor
  onCerrar: () => void;
  // Se llama al cerrar el resumen de un abono registrado, para actualizar la pantalla de origen.
  onRegistrado: (saldoNuevo: number, estado: EstadoCuenta) => void;
}

interface Registrado {
  monto: number;
  metodo: MetodoAbono;
  saldoNuevo: number;
  estado: EstadoCuenta;
}

const METODOS: MetodoAbono[] = ['efectivo', 'debito', 'credito', 'transferencia'];
const MONTO_MAXIMO = 99_999_999;

function textoSaldo(saldo: number) {
  if (saldo > 0) return `${formatearClp(saldo)} de deuda`;
  if (saldo < 0) return `${formatearClp(-saldo)} a favor`;
  return 'Al día';
}

export function AbonoModal({ clienteId, nombreCliente, saldo, onCerrar, onRegistrado }: Props) {
  const [saldoActual, setSaldoActual] = useState(saldo);
  const [texto, setTexto] = useState('');
  const [metodo, setMetodo] = useState<MetodoAbono>('efectivo');
  const [observacion, setObservacion] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [registrado, setRegistrado] = useState<Registrado | null>(null);

  const monto = texto.trim() === '' ? NaN : parsearMonto(texto);
  const montoValido = Number.isInteger(monto) && monto > 0 && monto <= MONTO_MAXIMO;
  const saldoResultante = montoValido ? saldoActual - monto : saldoActual;
  const quedaAFavor = montoValido && saldoResultante < 0 ? -saldoResultante : 0;
  const puedeRegistrar = montoValido && !enviando && (quedaAFavor === 0 || confirmado);

  function cambiarMonto(valor: string) {
    setTexto(valor);
    setConfirmado(false);
    setError('');
  }

  async function registrar(evento?: FormEvent) {
    evento?.preventDefault();
    if (!puedeRegistrar) return;
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post<{ saldo_nuevo: number; estado: EstadoCuenta }>(
        `/clientes/${clienteId}/abonos`,
        {
          monto,
          metodo_pago: metodo,
          observacion: observacion.trim() || undefined,
          confirmar_saldo_a_favor: quedaAFavor > 0 ? true : undefined,
        }
      );
      setRegistrado({ monto, metodo, saldoNuevo: data.saldo_nuevo, estado: data.estado });
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.codigo === 'ABONO_SUPERA_DEUDA') {
        // El saldo cambió mientras se escribía: se muestra el real y se vuelve a pedir confirmar.
        setSaldoActual(err.response.data.saldo as number);
        setConfirmado(false);
      }
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (registrado) {
    return (
      <Modal titulo="Abono registrado" idTitulo="titulo-abono-registrado" subtitulo={nombreCliente}
        onCerrar={() => onRegistrado(registrado.saldoNuevo, registrado.estado)}>
        <div className="cobro-total">
          <span>Abono</span>
          <strong>{formatearClp(registrado.monto)}</strong>
        </div>
        <p className="vuelto" role="status">
          {NOMBRE_METODO_ABONO[registrado.metodo]}. Ahora el cliente queda con{' '}
          <strong>{textoSaldo(registrado.saldoNuevo)}</strong>.
        </p>
        <div className="acciones">
          <button type="button" className="boton" autoFocus
            onClick={() => onRegistrado(registrado.saldoNuevo, registrado.estado)}>
            Listo
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Registrar abono" idTitulo="titulo-abono" subtitulo={nombreCliente} onCerrar={onCerrar}>
      <form onSubmit={registrar}>
        <div className="cobro-total">
          <span>{saldoActual < 0 ? 'Saldo a favor' : 'Saldo actual'}</span>
          <strong>{formatearClp(Math.abs(saldoActual))}</strong>
        </div>

        <div className="cobro-efectivo">
          <label className="campo">
            Monto del abono
            <div className="cantidad-caja">
              <input value={texto} inputMode="numeric" autoFocus autoComplete="off"
                placeholder={saldoActual > 0 ? formatearClp(saldoActual) : '$0'}
                aria-describedby="vista-saldo-abono"
                onChange={(e) => cambiarMonto(e.target.value)} />
            </div>
          </label>
          {saldoActual > 0 && (
            <div className="atajos-monto" aria-label="Montos rápidos">
              <button type="button" className="segmento segmento--simple"
                onClick={() => cambiarMonto(String(saldoActual))}>
                Toda la deuda
              </button>
            </div>
          )}
        </div>

        <p id="vista-saldo-abono" role="status"
          className={`vuelto${quedaAFavor > 0 || !montoValido ? ' vuelto--falta' : ''}`}>
          {!montoValido
            ? (texto.trim() === '' ? 'Escribe lo que paga el cliente'
              : Number.isNaN(monto) ? 'Escribe el monto en pesos enteros, sin decimales'
                : monto > MONTO_MAXIMO ? `El monto máximo es ${formatearClp(MONTO_MAXIMO)}`
                  : 'El monto debe ser mayor que $0')
            : <>Quedará con <strong>{textoSaldo(saldoResultante)}</strong></>}
        </p>

        {quedaAFavor > 0 && (
          <label className="confirmar-favor">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
            <span>
              El abono supera la deuda: quedarán {formatearClp(quedaAFavor)} a favor del cliente, que se
              descontarán de sus próximas compras al fiado. Confirmo que es correcto.
            </span>
          </label>
        )}

        <fieldset className="grupo">
          <legend>¿Cómo pagó?</legend>
          <div className="metodos" role="radiogroup" aria-label="Cómo pagó el cliente">
            {METODOS.map((clave) => (
              <label key={clave} className={`motivo${metodo === clave ? ' motivo--activo' : ''}`}>
                <input type="radio" name="metodo-abono" checked={metodo === clave}
                  onChange={() => setMetodo(clave)} />
                <span className="motivo-nombre">{NOMBRE_METODO_ABONO[clave]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="campo">
          Observación (opcional)
          <input value={observacion} maxLength={255} onChange={(e) => setObservacion(e.target.value)}
            placeholder="Por ejemplo: pagó la mitad" />
        </label>

        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton" disabled={!puedeRegistrar}>
            {enviando ? 'Registrando…' : 'Registrar abono'}
          </button>
          <button type="button" className="boton boton--secundario" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
