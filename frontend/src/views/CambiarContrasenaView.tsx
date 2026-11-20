// Cambio de contraseña obligatorio al usar una credencial temporal.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';

export function VistaCambiarContrasena() {
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { limpiarSesionLocal } = useAutenticacion();
  const navegar = useNavigate();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/cambiar-contrasena', {
        contrasenaActual,
        nuevaContrasena,
      });
      limpiarSesionLocal();
      navegar('/login', { state: { aviso: data.mensaje } });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <section>
      <h2>Cambiar contraseña</h2>
      <p>Usas una contraseña temporal: elige una nueva para continuar.</p>
      <form onSubmit={enviar}>
        <label>
          Contraseña actual
          <input type="password" value={contrasenaActual}
            onChange={(e) => setContrasenaActual(e.target.value)} required />
        </label>
        <label>
          Nueva contraseña (mínimo 8 caracteres)
          <input type="password" value={nuevaContrasena}
            onChange={(e) => setNuevaContrasena(e.target.value)} required minLength={8} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={cargando}>
          {cargando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </section>
  );
}
