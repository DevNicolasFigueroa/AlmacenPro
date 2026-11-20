// Cambio de contraseña propio (spec 001, RF-22 y RF-28).
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';

function validarNueva(nueva: string, identificador: string, confirmacion: string) {
  if (nueva.trim().length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres';
  if (identificador && nueva.trim().toLowerCase() === identificador.trim().toLowerCase()) {
    return 'La nueva contraseña no puede ser igual a tu usuario';
  }
  if (nueva !== confirmacion) return 'Las contraseñas nuevas no coinciden';
  return '';
}

export function VistaCambiarContrasena() {
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { limpiarSesionLocal, usuario } = useAutenticacion();
  const navegar = useNavigate();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');

    // La validación final la hace el backend; esto solo evita viajes innecesarios.
    const problema = validarNueva(nuevaContrasena, usuario?.usuario ?? '', confirmacion);
    if (problema) {
      setError(problema);
      return;
    }

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
          Nueva contraseña (mínimo 8 caracteres, distinta de tu usuario)
          <input type="password" value={nuevaContrasena}
            onChange={(e) => setNuevaContrasena(e.target.value)} required minLength={8} />
        </label>
        <label>
          Confirmar nueva contraseña
          <input type="password" value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={cargando}>
          {cargando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </section>
  );
}
