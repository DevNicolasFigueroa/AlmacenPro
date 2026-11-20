// Recuperación local de administradores con código de un solo uso (sin correo).
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../services/api';

export function VistaRecuperarContrasena() {
  const [usuario, setUsuario] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navegar = useNavigate();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
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
          Nueva contraseña (mínimo 8 caracteres)
          <input type="password" value={nuevaContrasena}
            onChange={(e) => setNuevaContrasena(e.target.value)} required minLength={8} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={cargando}>
          {cargando ? 'Restableciendo…' : 'Restablecer contraseña'}
        </button>
      </form>
      <p><a href="/login">Volver al inicio de sesión</a></p>
    </section>
  );
}
