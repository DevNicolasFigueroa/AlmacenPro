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
    <main className="acceso">
      <section className="acceso-hoja" aria-labelledby="titulo-recuperar">
        <h2 id="titulo-recuperar">Recupera tu acceso</h2>
        <p>Ingresa el código de recuperación que guardaste al crear la cuenta de administrador.</p>
        <form onSubmit={enviar}>
          <label className="campo">
            Usuario
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} required
              autoComplete="username" />
          </label>
          <label className="campo">
            Código de recuperación
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required
              autoComplete="off" />
          </label>
          <label className="campo">
            Nueva contraseña
            <input type="password" value={nuevaContrasena}
              onChange={(e) => setNuevaContrasena(e.target.value)} required minLength={8}
              autoComplete="new-password" />
          </label>
          <p className="ayuda">Mínimo 8 caracteres y distinta del usuario.</p>
          <label className="campo">
            Confirmar nueva contraseña
            <input type="password" value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)} required
              autoComplete="new-password" />
          </label>
          {error && <p role="alert" className="alerta alerta--error">{error}</p>}
          <button type="submit" className="boton" disabled={cargando}>
            {cargando ? 'Restableciendo…' : 'Restablecer contraseña'}
          </button>
        </form>
        <p className="acceso-pie">
          Esta opción es solo para cuentas de administrador. Los cajeros deben pedir una
          nueva contraseña al administrador.
        </p>
        <p className="acceso-pie"><a href="/login">Volver al inicio de sesión</a></p>
      </section>
    </main>
  );
}
