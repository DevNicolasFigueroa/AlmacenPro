// Cobro de la venta (spec 003, RF-14–19, RF-25–31): método de pago, monto recibido y vuelto en
// efectivo, y cliente por RUT. Aquí solo se ayuda a cobrar rápido: el servidor valida todo.
import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import { formatearClp, parsearMonto } from '../utils/formato';
import { IdentificarCliente } from './IdentificarCliente';
import { Modal } from './Modal';
import type {
  ClienteVenta, MetodoPago, ProblemaConfirmacion, RespuestaConfirmacion,
} from '../types';
import '../styles/ventas.css';

interface Props {
  ventaId: number;
  total: number;
  onCerrar: () => void;
  onConfirmada: (respuesta: RespuestaConfirmacion, cliente: ClienteVenta | null) => void;
  // Stock que bajó o producto desactivado: se vuelve al carrito para corregirlo (RF-26, RF-27).
  onProblemas: (problemas: ProblemaConfirmacion[], mensaje: string) => void;
  // La venta ya estaba confirmada (doble clic o reintento): se muestra su estado real.
  onYaConfirmada: () => void;
  // Se cortó la conexión sin respuesta: no se sabe si la venta quedó registrada (RF-30).
  onSinRespuesta: () => void;
}

const METODOS: { clave: MetodoPago; texto: string; ayuda: string; atajo: string }[] = [
  { clave: 'efectivo', texto: 'Efectivo', ayuda: 'Con vuelto', atajo: '1' },
  { clave: 'debito', texto: 'Débito', ayuda: 'Solo se registra', atajo: '2' },
  { clave: 'credito', texto: 'Crédito', ayuda: 'Solo se registra', atajo: '3' },
  { clave: 'fiado', texto: 'Fiado', ayuda: 'Queda como deuda', atajo: '4' },
];

const BILLETES = [1000, 2000, 5000, 10000, 20000];

export function PanelCobro({
  ventaId, total, onCerrar, onConfirmada, onProblemas, onYaConfirmada, onSinRespuesta,
}: Props) {
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [recibido, setRecibido] = useState('');
  const [cliente, setCliente] = useState<ClienteVenta | null>(null);
  const [pendiente, setPendiente] = useState(false); // RUT escrito sin asociar
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const monto = recibido.trim() === '' ? NaN : parsearMonto(recibido);
  const faltan = Number.isNaN(monto) ? total : Math.max(0, total - monto);
  const vuelto = Number.isNaN(monto) ? 0 : Math.max(0, monto - total);

  // Atajos de monto: el valor exacto y los billetes que alcanzan para el total.
  const atajos = useMemo(() => {
    const mayores = BILLETES.filter((billete) => billete >= total).slice(0, 3);
    return [total, ...mayores.filter((billete) => billete !== total)];
  }, [total]);

  const puedeConfirmar = !enviando && !pendiente && (
    metodo === 'efectivo' ? !Number.isNaN(monto) && monto >= total
      : metodo === 'fiado' ? cliente !== null
        : true
  );

  async function confirmar() {
    if (!puedeConfirmar) return;
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post<RespuestaConfirmacion>(`/ventas/${ventaId}/confirmar`, {
        metodo_pago: metodo,
        cliente_id: cliente?.id,
        monto_recibido: metodo === 'efectivo' ? monto : undefined,
      });
      onConfirmada(data, cliente);
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        const datos = err.response.data ?? {};
        if (datos.codigo === 'VENTA_YA_CONFIRMADA') { onYaConfirmada(); return; }
        if (Array.isArray(datos.problemas)) {
          onProblemas(datos.problemas as ProblemaConfirmacion[], datos.mensaje);
          return;
        }
      }
      if (isAxiosError(err) && !err.response) {
        onSinRespuesta();
        return;
      }
      setError(mensajeError(err));
      setEnviando(false);
    }
  }

  // Atajos de teclado para cobrar sin usar el mouse: las teclas 1 a 4 eligen el método. Dentro de
  // un campo de texto, donde los números son parte de lo que se escribe, se usa Alt + número.
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      const destino = evento.target as HTMLElement;
      const escribiendo = destino.tagName === 'TEXTAREA'
        || (destino.tagName === 'INPUT' && (destino as HTMLInputElement).type !== 'radio');
      if (escribiendo && !evento.altKey) return;
      const elegido = METODOS.find((m) => m.atajo === evento.key);
      if (!elegido) return;
      evento.preventDefault();
      setMetodo(elegido.clave);
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, []);

  return (
    <Modal titulo="Cobrar" idTitulo="titulo-cobro" subtitulo={`Venta n.º ${ventaId}`} onCerrar={onCerrar}>
      <div className="cobro-total">
        <span>Total a cobrar</span>
        <strong>{formatearClp(total)}</strong>
      </div>

      <fieldset className="grupo">
        <legend>Método de pago</legend>
        <div className="metodos" role="radiogroup" aria-label="Método de pago">
          {METODOS.map(({ clave, texto, ayuda, atajo }) => (
            <label key={clave} className={`motivo${metodo === clave ? ' motivo--activo' : ''}`}>
              <input type="radio" name="metodo" checked={metodo === clave}
                onChange={() => setMetodo(clave)} />
              <span className="motivo-nombre">
                {texto}
                <span className="atajo" title={`Tecla ${atajo}, o Alt + ${atajo} desde un campo`}>{atajo}</span>
              </span>
              <span className="motivo-ayuda">{ayuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {metodo === 'efectivo' && (
        <div className="cobro-efectivo">
          <label className="campo">
            Monto recibido
            <div className="cantidad-caja">
              <input value={recibido} inputMode="numeric" autoFocus placeholder={formatearClp(total)}
                onChange={(e) => setRecibido(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } }} />
            </div>
          </label>
          <div className="atajos-monto" aria-label="Montos rápidos">
            {atajos.map((valor) => (
              <button key={valor} type="button" className="segmento"
                onClick={() => setRecibido(String(valor))}>
                {valor === total ? 'Exacto' : formatearClp(valor)}
              </button>
            ))}
          </div>
          <p className={`vuelto${faltan > 0 ? ' vuelto--falta' : ''}`} role="status">
            {faltan > 0
              ? (Number.isNaN(monto) ? 'Ingresa lo que entrega el cliente' : `Faltan ${formatearClp(faltan)}`)
              : <>Vuelto <strong>{formatearClp(vuelto)}</strong></>}
          </p>
        </div>
      )}

      <IdentificarCliente obligatorio={metodo === 'fiado'} cliente={cliente} onCliente={setCliente}
        onPendiente={setPendiente} />
      {pendiente && (
        <p className="ayuda ayuda--cliente" role="status">
          Busca el RUT para asociarlo a la venta, o bórralo para vender sin cliente.
        </p>
      )}

      {metodo === 'fiado' && cliente && (
        <p className="ayuda ayuda--cliente">
          La venta de {formatearClp(total)} se suma a lo que ya debe {cliente.nombre ?? cliente.rut_formateado}.
        </p>
      )}

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      <div className="acciones">
        <button type="button" className="boton boton--cobrar-modal" disabled={!puedeConfirmar}
          onClick={confirmar}>
          {enviando ? 'Confirmando…' : metodo === 'fiado' ? 'Confirmar fiado' : 'Confirmar venta'}
        </button>
        <button type="button" className="boton boton--secundario" disabled={enviando} onClick={onCerrar}>
          Volver a la venta
        </button>
      </div>
    </Modal>
  );
}
