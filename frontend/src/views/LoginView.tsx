// Vista de inicio de sesión (primer contacto del usuario con el sistema).
// Diseño: letrero de almacén de barrio a la izquierda y hoja de ingreso a la derecha.
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import type { RespuestaLogin } from '../types';
import './LoginView.css';

export function VistaLogin() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { iniciarSesion } = useAutenticacion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  // El motivo de un cierre de sesión forzado (venta cancelada por inactividad, sesión vencida...)
  // se lee al crear el estado y se borra después: si se leyera en el efecto, el doble montaje de
  // StrictMode lo borraba en la primera pasada y lo dejaba vacío en la segunda.
  const [avisoSesion] = useState(() => sessionStorage.getItem('almacenpro_aviso') ?? '');
  const aviso = (ubicacion.state as { aviso?: string } | null)?.aviso ?? avisoSesion;

  useEffect(() => {
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
    <main className="login">
      <section className="login-letrero" aria-label="AlmacenPro">
        <div className="login-placa">
          <h1>AlmacenPro</h1>
          <p>Tu mostrador, en orden.</p>
        </div>
      </section>

      <section className="login-hoja">
        <div className="login-contenedor">
          <h2 className="login-titulo">Iniciar sesión</h2>

          {aviso && <p className="login-aviso">{aviso}</p>}

          <form onSubmit={enviar} className="login-form">
            <label className="login-campo">
              <span>Usuario</span>
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="login-campo">
              <span>Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p role="alert" className="login-error">{error}</p>}
            <button type="submit" className="login-boton" disabled={cargando}>
              {cargando ? 'Ingresando…' : 'Entrar a la caja'}
            </button>
          </form>

          <p className="login-pie">
            ¿Olvidaste tu contraseña?{' '}
            <a href="/recuperar-contrasena">Recuperar acceso</a>
          </p>
          {/* RF-31: la recuperación es solo del administrador; el cajero depende del administrador. */}
          <p className="login-nota">
            Solo el administrador puede recuperar su acceso con código. Si eres cajero,
            pídele al administrador que te genere una nueva contraseña.
          </p>
        </div>
      </section>
    </main>
  );
}
