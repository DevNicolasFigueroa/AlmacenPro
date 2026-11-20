// Gestión de cuentas: solo administradores (spec 001, RF-18 a RF-27).
import { useEffect, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import type { Cuenta, CuentaNueva, RespuestaContrasena, RespuestaCuenta } from '../types';

const formularioInicial: CuentaNueva = {
  nombre: '', usuario: '', password: '', rol: 'cajero',
};

function formatearFecha(valor: string | undefined) {
  if (!valor) return '';
  const fecha = new Date(String(valor).replace(' ', 'T') + 'Z');
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleString('es-CL');
}

export function VistaUsuarios() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [formulario, setFormulario] = useState<CuentaNueva>(formularioInicial);
  const [mensaje, setMensaje] = useState('');
  const [secreto, setSecreto] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    try {
      const { data } = await api.get<Cuenta[]>('/auth/usuarios');
      setCuentas(data);
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  useEffect(() => { cargar(); }, []);

  const adminsActivos = cuentas.filter(
    (cuenta) => cuenta.rol === 'administrador' && cuenta.activo
  ).length;

  // RF-26 y RF-27: las acciones que dejarían el negocio sin administrador se deshabilitan.
  function esUltimoAdministrador(cuenta: Cuenta) {
    return cuenta.rol === 'administrador' && cuenta.activo === 1 && adminsActivos <= 1;
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setSecreto('');
    try {
      const { data } = await api.post<RespuestaCuenta>('/auth/usuarios', formulario);
      setMensaje(data.mensaje);
      if (data.codigoRecuperacion) {
        setSecreto(`CÓDIGO DE RECUPERACIÓN: ${data.codigoRecuperacion}`);
      } else if (data.contrasenaTemporal) {
        setSecreto(`CONTRASEÑA TEMPORAL: ${data.contrasenaTemporal}`);
      }
      setFormulario(formularioInicial);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function cambiarEstado(cuenta: Cuenta) {
    setError('');
    try {
      const { data } = await api.patch<RespuestaCuenta>(`/auth/usuarios/${cuenta.id}/estado`, {
        activo: !cuenta.activo,
      });
      setMensaje(data.mensaje);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function restablecer(cuenta: Cuenta) {
    setError('');
    setSecreto('');
    try {
      const { data } = await api.patch<RespuestaContrasena>(`/auth/usuarios/${cuenta.id}/contrasena`);
      setMensaje(data.mensaje);
      if (data.contrasenaTemporal) {
        setSecreto(`CONTRASEÑA TEMPORAL: ${data.contrasenaTemporal}`);
      }
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <section>
      <h2>Cuentas del almacén</h2>
      {mensaje && <p>{mensaje}</p>}
      {error && <p role="alert">{error}</p>}

      <h3>Crear cuenta</h3>
      <form onSubmit={crear}>
        <label>Nombre<input value={formulario.nombre}
          onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} required /></label>
        <label>Usuario<input value={formulario.usuario}
          onChange={(e) => setFormulario({ ...formulario, usuario: e.target.value })} required /></label>
        {formulario.rol === 'administrador' && (
          <label>Contraseña (mínimo 8 caracteres)<input type="password" value={formulario.password ?? ''}
            onChange={(e) => setFormulario({ ...formulario, password: e.target.value })}
            required minLength={8} /></label>
        )}
        {formulario.rol === 'cajero' && (
          <p>El sistema generará una contraseña temporal que el cajero deberá cambiar en su primer ingreso.</p>
        )}
        <label>Rol
          <select value={formulario.rol}
            onChange={(e) => setFormulario({
              ...formulario,
              rol: e.target.value as CuentaNueva['rol'],
              password: '',
            })}>
            <option value="cajero">Cajero</option>
            <option value="administrador">Administrador</option>
          </select>
        </label>
        <button type="submit">Crear cuenta</button>
      </form>

      <h3>Cuentas existentes</h3>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Última actualización</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((cuenta) => {
            const bloqueada = esUltimoAdministrador(cuenta);
            const avisoBloqueo = 'Debe quedar al menos un Administrador activo';
            return (
              <tr key={cuenta.id}>
                <td>{cuenta.nombre}</td>
                <td>{cuenta.usuario}</td>
                <td>{cuenta.rol === 'administrador' ? 'Administrador' : 'Cajero'}</td>
                <td>{cuenta.activo ? 'Activa' : 'Desactivada'}</td>
                <td>{formatearFecha(cuenta.actualizado_en)}</td>
                <td>
                  <button onClick={() => cambiarEstado(cuenta)} disabled={bloqueada}
                    title={bloqueada ? avisoBloqueo : undefined}>
                    {cuenta.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => restablecer(cuenta)} disabled={bloqueada}
                    title={bloqueada ? avisoBloqueo : undefined}>
                    Restablecer contraseña
                  </button>
                  {bloqueada && <span>Es el único Administrador activo.</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* RNF-2: el secreto se muestra una sola vez y bloquea la pantalla
          hasta que el administrador confirma que lo guardó. */}
      {secreto && (
        <div role="dialog" aria-modal="true" className="modal-secreto">
          <h3>Guarda este dato ahora</h3>
          <p>{secreto}</p>
          <p><strong>No se volverá a mostrar.</strong> Guárdalo en un lugar seguro antes de continuar.</p>
          <button onClick={() => setSecreto('')}>Ya lo guardé</button>
        </div>
      )}
    </section>
  );
}
