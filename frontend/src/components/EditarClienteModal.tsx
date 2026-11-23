// Agregar, cambiar o borrar los datos de un cliente (spec 004, RF-20): nombre, teléfono, correo y
// dirección, todos opcionales. Dejar un campo vacío borra ese dato. El RUT se corrige aparte, con
// su propia confirmación. La interfaz solo ayuda: el backend valida formatos y topes.
import { useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import { Modal } from './Modal';
import type { ClienteCuenta } from '../types';

interface Props {
  cliente: ClienteCuenta;
  onGuardado: (mensaje: string) => void;
  onCerrar: () => void;
}

export function EditarClienteModal({ cliente, onGuardado, onCerrar }: Props) {
  const [nombre, setNombre] = useState(cliente.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente.telefono ?? '');
  const [email, setEmail] = useState(cliente.email ?? '');
  const [direccion, setDireccion] = useState(cliente.direccion ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      // Se envían los cuatro: un campo vacío borra el dato.
      const { data } = await api.patch<{ mensaje: string }>(`/clientes/${cliente.id}`, {
        nombre, telefono, email, direccion,
      });
      onGuardado(data.mensaje);
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Datos del cliente" idTitulo="titulo-editar-cliente"
      subtitulo={cliente.rut_formateado} onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <label className="campo">
          Nombre
          <input value={nombre} maxLength={150} autoFocus autoComplete="off"
            onChange={(e) => setNombre(e.target.value)} placeholder="Puedes dejarlo vacío" />
        </label>
        <label className="campo">
          Teléfono
          <input value={telefono} maxLength={20} inputMode="tel" autoComplete="off"
            onChange={(e) => setTelefono(e.target.value)} placeholder="+56 9 1234 5678" />
        </label>
        <label className="campo">
          Correo electrónico
          <input value={email} maxLength={120} inputMode="email" autoComplete="off"
            onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.cl" />
        </label>
        <label className="campo">
          Dirección
          <input value={direccion} maxLength={200} autoComplete="off"
            onChange={(e) => setDireccion(e.target.value)} />
        </label>
        <p className="ayuda">Si borras un dato y guardas, el cliente queda sin ese dato.</p>

        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
          <button type="button" className="boton boton--secundario" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
