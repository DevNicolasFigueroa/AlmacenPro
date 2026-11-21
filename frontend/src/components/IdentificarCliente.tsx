// Identificación del cliente por su RUT al cobrar (spec 003, RF-17, RF-18, RF-20–22).
// El RUT es el único identificador y es opcional salvo en el fiado: dejar el campo vacío es la
// forma de omitirlo (una sola acción: confirmar). Si el RUT no está registrado, se ofrece
// registrarlo en el momento con solo el RUT (el nombre es opcional).
import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import { formatearClp } from '../utils/formato';
import { esRutValido, formatearAlEscribir, formatearRut, normalizarRut } from '../utils/rut';
import type { ClienteVenta } from '../types';
import '../styles/ventas.css';

interface Props {
  obligatorio: boolean; // el fiado exige cliente
  cliente: ClienteVenta | null;
  onCliente: (cliente: ClienteVenta | null) => void;
  // Hay un RUT escrito que aún no se asoció (sin buscar o sin registrar): conviene no confirmar así.
  onPendiente?: (pendiente: boolean) => void;
}

// RF-18: destaca si el cliente está en deuda o tiene saldo a favor, sin bloquear la venta.
function EstadoDeCuenta({ cliente }: { cliente: ClienteVenta }) {
  if (cliente.estado === 'deuda') {
    return <span className="chip chip--alerta">En deuda: {formatearClp(cliente.saldo)}</span>;
  }
  if (cliente.estado === 'a_favor') {
    return <span className="chip">Saldo a favor: {formatearClp(-cliente.saldo)}</span>;
  }
  return <span className="chip chip--apagado">Sin deuda</span>;
}

export function IdentificarCliente({ obligatorio, cliente, onCliente, onPendiente }: Props) {
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [nuevoRut, setNuevoRut] = useState<string | null>(null); // RUT válido sin registrar
  const [nombre, setNombre] = useState('');

  const pendiente = !cliente && (texto.trim() !== '' || nuevoRut !== null);
  useEffect(() => { onPendiente?.(pendiente); }, [pendiente, onPendiente]);

  async function buscar(evento?: FormEvent) {
    evento?.preventDefault();
    setError('');
    if (texto.trim() === '') {
      if (obligatorio) setError('El fiado necesita el RUT del cliente');
      return;
    }
    if (!esRutValido(texto)) {
      setError('El RUT no es válido: revisa que esté bien escrito, con su dígito verificador');
      return;
    }

    const rut = normalizarRut(texto) as string;
    setBuscando(true);
    try {
      const { data } = await api.get<ClienteVenta>(`/clientes/rut/${rut}`);
      onCliente(data);
      setTexto('');
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        setNuevoRut(rut); // no está registrado: se ofrece registrarlo
      } else {
        setError(mensajeError(err));
      }
    } finally {
      setBuscando(false);
    }
  }

  // RF-20: se registra con solo el RUT; el nombre se anota si se escribió.
  async function registrar(evento?: FormEvent) {
    evento?.preventDefault();
    if (!nuevoRut) return;
    setError('');
    setBuscando(true);
    try {
      const { data } = await api.post<{ cliente: ClienteVenta }>('/clientes', {
        rut: nuevoRut, nombre: nombre.trim() || undefined,
      });
      onCliente(data.cliente);
      reiniciar();
    } catch (err) {
      // RF-21: si alguien lo registró mientras tanto, se elige a ese cliente.
      if (isAxiosError(err) && err.response?.data?.codigo === 'RUT_REPETIDO') {
        onCliente(err.response.data.cliente as ClienteVenta);
        reiniciar();
      } else {
        setError(mensajeError(err));
      }
    } finally {
      setBuscando(false);
    }
  }

  function reiniciar() {
    setTexto('');
    setNombre('');
    setNuevoRut(null);
    setError('');
  }

  if (cliente) {
    return (
      <div className="cliente-tarjeta">
        <div className="cliente-datos">
          <span className="cliente-nombre">{cliente.nombre ?? cliente.rut_formateado}</span>
          {cliente.nombre && <span className="cliente-rut">{cliente.rut_formateado}</span>}
        </div>
        <EstadoDeCuenta cliente={cliente} />
        <button type="button" className="boton boton--pequeno boton--secundario"
          onClick={() => { onCliente(null); reiniciar(); }}>
          Cambiar
        </button>
      </div>
    );
  }

  if (nuevoRut) {
    return (
      <form className="cliente-nuevo" onSubmit={registrar}>
        <p className="cliente-nuevo-titulo">
          Cliente nuevo: el RUT {formatearRut(nuevoRut)} aún no está registrado.
        </p>
        <label className="campo">
          Nombre (opcional)
          <input value={nombre} maxLength={150} autoFocus
            onChange={(e) => setNombre(e.target.value)} placeholder="Puedes dejarlo vacío" />
        </label>
        {error && <p role="alert" className="error-campo">{error}</p>}
        <div className="acciones">
          <button type="submit" className="boton boton--pequeno" disabled={buscando}>
            Registrar y asociar
          </button>
          <button type="button" className="boton boton--pequeno boton--secundario" onClick={reiniciar}>
            Corregir RUT
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="cliente-busqueda" onSubmit={buscar}>
      <label className="campo">
        {obligatorio ? 'RUT del cliente (obligatorio para fiar)' : 'RUT del cliente (opcional)'}
        <div className="campo-con-boton">
          <input value={texto} inputMode="text" autoComplete="off" placeholder="12.345.678-5"
            onChange={(e) => { setTexto(formatearAlEscribir(e.target.value)); setError(''); }} />
          <button type="submit" className="boton boton--pequeno boton--secundario"
            disabled={buscando || texto.trim() === ''}>
            Buscar
          </button>
        </div>
      </label>
      {error
        ? <p role="alert" className="error-campo">{error}</p>
        : !obligatorio && <p className="ayuda ayuda--cliente">
            Déjalo vacío para vender sin cliente. Con RUT, la compra queda en su cuenta.
          </p>}
    </form>
  );
}
