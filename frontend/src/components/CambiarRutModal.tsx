// Corregir el RUT de un cliente (spec 004, RF-21 a RF-25). Primero se escribe el RUT nuevo y se valida;
// luego el servidor avisa que todas las compras, los fiados y el saldo pasan al RUT nuevo y la persona
// confirma. Si el RUT ya es de otro cliente se indica quién es: no se unen cuentas. Cada cambio queda
// registrado con quién lo hizo y cuándo.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import { formatearClp } from '../utils/formato';
import { esRutValido, formatearAlEscribir, formatearRut, normalizarRut } from '../utils/rut';
import { Modal } from './Modal';
import type { ClienteCuenta } from '../types';

interface Props {
  cliente: ClienteCuenta;
  onCambiado: (mensaje: string) => void;
  onCerrar: () => void;
}

interface Aviso {
  compras: number;
  saldo: number;
}

interface Repetido {
  id: number;
  nombre: string | null;
  rut_formateado: string;
}

export function CambiarRutModal({ cliente, onCambiado, onCerrar }: Props) {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [repetido, setRepetido] = useState<Repetido | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const nombre = cliente.nombre ?? cliente.rut_formateado;
  const rutNuevo = normalizarRut(texto);

  function escribir(valor: string) {
    setTexto(formatearAlEscribir(valor));
    setError('');
    setRepetido(null);
    setAviso(null);
  }

  // Sin confirmar, el servidor no cambia nada y responde con el aviso; con confirmar, cambia el RUT.
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError('');
    setRepetido(null);
    if (!esRutValido(texto)) {
      setError('El RUT no es válido: revisa que esté bien escrito, con su dígito verificador');
      return;
    }

    setEnviando(true);
    try {
      const { data } = await api.patch<{ mensaje: string }>(`/clientes/${cliente.id}/rut`, {
        rut: rutNuevo,
        confirmar: aviso !== null ? true : undefined,
      });
      onCambiado(data.mensaje);
    } catch (err) {
      const datos = isAxiosError(err) ? err.response?.data : undefined;
      if (datos?.codigo === 'CONFIRMACION_REQUERIDA') {
        setAviso({ compras: datos.compras as number, saldo: datos.saldo as number });
      } else if (datos?.codigo === 'RUT_REPETIDO') {
        setRepetido(datos.cliente as Repetido);
        setError(datos.mensaje as string);
      } else {
        setError(mensajeError(err));
      }
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Corregir RUT" idTitulo="titulo-cambiar-rut"
      subtitulo={`${nombre} · RUT actual ${cliente.rut_formateado}`} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <label className="campo">
          RUT nuevo
          <input value={texto} autoFocus autoComplete="off" placeholder="12.345.678-5"
            readOnly={aviso !== null} onChange={(e) => escribir(e.target.value)} />
        </label>

        {aviso && (
          <div className="alerta alerta--aviso" role="status">
            <strong>Todo pasa al RUT {formatearRut(rutNuevo ?? texto)}</strong>
            <p>
              {aviso.compras === 1 ? 'La compra' : `Las ${aviso.compras} compras`} de {nombre}, sus fiados y su
              saldo ({aviso.saldo > 0 ? `debe ${formatearClp(aviso.saldo)}`
                : aviso.saldo < 0 ? `a favor ${formatearClp(-aviso.saldo)}` : 'al día'}) quedan asociados
              al RUT nuevo. El cambio queda registrado con tu nombre.
            </p>
          </div>
        )}

        {error && <p role="alert" className="alerta alerta--error">{error}</p>}
        {repetido && (
          <p className="ayuda">
            <Link to={`/clientes/${repetido.id}`} className="enlace-fila" onClick={onCerrar}>
              Ver la cuenta de {repetido.nombre ?? repetido.rut_formateado}
            </Link>
            . Si lo que quieres es registrar una compra a esa persona, hazlo desde la venta.
          </p>
        )}

        <div className="acciones">
          <button type="submit" className="boton" disabled={enviando || texto.trim() === ''}>
            {enviando ? 'Guardando…' : aviso ? 'Confirmar el cambio de RUT' : 'Continuar'}
          </button>
          {aviso && (
            <button type="button" className="boton boton--secundario" disabled={enviando}
              onClick={() => setAviso(null)}>
              Corregir el RUT escrito
            </button>
          )}
          <button type="button" className="boton boton--secundario" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
