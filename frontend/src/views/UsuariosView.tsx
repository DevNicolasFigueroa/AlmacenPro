// Gestión de cuentas: solo administradores (spec 001, RF-12 a RF-17).
import { useEffect, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import type { Cuenta, CuentaNueva, RespuestaContrasena, RespuestaCuenta } from '../types';

const formularioInicial: CuentaNueva = {
  nombre: '', usuario: '', password: '', rol: 'cajero',
};

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
      <ul>
        {cuentas.map((cuenta) => (
          <li key={cuenta.id}>
            {cuenta.nombre} ({cuenta.usuario}) — {cuenta.rol}
            {cuenta.rol === 'administrador' ? (
              <span> — Cuenta permanente</span>
            ) : (
              <>
                {cuenta.activo ? ' — Activa' : ' — Desactivada'}
                <button onClick={() => cambiarEstado(cuenta)}>
                  {cuenta.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => restablecer(cuenta)}>Restablecer contraseña</button>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* RF-18 y RF-19: el secreto se muestra una sola vez y bloquea la pantalla
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
