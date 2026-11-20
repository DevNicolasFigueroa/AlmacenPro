// Vista de inicio de sesión (primer contacto del usuario con el sistema).
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import type { RespuestaLogin } from '../types';

export function VistaLogin() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { iniciarSesion } = useAutenticacion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [avisoSesion, setAvisoSesion] = useState('');
  const aviso = (ubicacion.state as { aviso?: string } | null)?.aviso ?? avisoSesion;

  useEffect(() => {
    setAvisoSesion(sessionStorage.getItem('almacenpro_aviso') ?? '');
    sessionStorage.removeItem('almacenpro_aviso');
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const { data } = await api.post<RespuestaLogin>('/auth/login', { usuario, password });
      iniciarSesion(data.usuario, data.token);
      navegar(data.usuario.requiereCambioContrasena ? '/cambiar-contrasena' : '/ventas');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-contenedor">
      <h1>AlmacenPro</h1>
      {aviso && <p>{aviso}</p>}
      <form onSubmit={enviar}>
        <label>
          Usuario
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={cargando}>
          {cargando ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
      <p>
        ¿Olvidaste tu contraseña? Usa tu código de recuperación:{' '}
        <a href="/recuperar-contrasena">Recuperar acceso</a>
      </p>
    </div>
  );
}
