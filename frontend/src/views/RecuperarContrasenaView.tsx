// Recuperación local de administradores con código de un solo uso (spec 001, RF-29 y RF-31).
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../services/api';

function validarNueva(nueva: string, identificador: string, confirmacion: string) {
  if (nueva.trim().length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres';
  if (identificador && nueva.trim().toLowerCase() === identificador.trim().toLowerCase()) {
    return 'La nueva contraseña no puede ser igual al usuario';
  }
  if (nueva !== confirmacion) return 'Las contraseñas nuevas no coinciden';
  return '';
}

export function VistaRecuperarContrasena() {
  const [usuario, setUsuario] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navegar = useNavigate();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');

    // La validación final la hace el backend; esto solo evita viajes innecesarios.
    const problema = validarNueva(nuevaContrasena, usuario, confirmacion);
    if (problema) {
      setError(problema);
      return;
    }

    setCargando(true);
    try {
      const { data } = await api.post('/auth/recuperar-contrasena', {
        usuario,
        codigoRecuperacion: codigo,
        nuevaContrasena,
      });
      navegar('/login', { state: { aviso: data.mensaje } });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <section>
      <h2>Recuperar acceso de administrador</h2>
      <p>Ingresa el código de recuperación que guardaste al crear la cuenta.</p>
      <form onSubmit={enviar}>
        <label>
          Usuario
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </label>
        <label>
          Código de recuperación
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        </label>
        <label>
          Nueva contraseña (mínimo 8 caracteres, distinta del usuario)
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
          {cargando ? 'Restableciendo…' : 'Restablecer contraseña'}
        </button>
      </form>
      <p className="aviso-recuperacion">
        Esta opción es solo para cuentas de administrador. Los cajeros deben pedir una
        nueva contraseña al administrador.
      </p>
      <p><a href="/login">Volver al inicio de sesión</a></p>
    </section>
  );
}
