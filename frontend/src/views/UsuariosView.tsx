// Gestión de cuentas: solo administradores (spec 001, RF-18 a RF-27).
import { useEffect, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import type { Cuenta, CuentaNueva, RespuestaContrasena, RespuestaCuenta } from '../types';

const formularioInicial: CuentaNueva = {
  nombre: '', usuario: '', password: '', rol: 'cajero',
};

// Secreto que se muestra una sola vez: la etiqueta explica qué es y el valor va en grande.
interface Secreto {
  etiqueta: string;
  valor: string;
}

// MySQL entrega 'YYYY-MM-DD HH:mm:ss' en hora local del servidor: no se interpreta como UTC
// (agregarle 'Z' mostraba la hora atrasada en la diferencia con UTC, 3 h en Chile).
function formatearFecha(valor: string | undefined) {
  if (!valor) return '';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleString('es-CL');
}

export function VistaUsuarios() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [formulario, setFormulario] = useState<CuentaNueva>(formularioInicial);
  const [mensaje, setMensaje] = useState('');
  const [secreto, setSecreto] = useState<Secreto | null>(null);
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
    setSecreto(null);
    try {
      const { data } = await api.post<RespuestaCuenta>('/auth/usuarios', formulario);
      setMensaje(data.mensaje);
      if (data.codigoRecuperacion) {
        setSecreto({ etiqueta: 'Código de recuperación', valor: data.codigoRecuperacion });
      } else if (data.contrasenaTemporal) {
        setSecreto({ etiqueta: 'Contraseña temporal', valor: data.contrasenaTemporal });
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
    setSecreto(null);
    try {
      const { data } = await api.patch<RespuestaContrasena>(`/auth/usuarios/${cuenta.id}/contrasena`);
      setMensaje(data.mensaje);
      if (data.contrasenaTemporal) {
        setSecreto({ etiqueta: 'Contraseña temporal', valor: data.contrasenaTemporal });
      }
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Cuentas del almacén</h2>
          <p className="pagina-descripcion">Quién puede entrar al sistema y con qué rol.</p>
        </div>
      </header>

      {mensaje && <p role="status" className="alerta alerta--ok">{mensaje}</p>}
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      <div className="cuentas-grid">
        <section className="hoja" aria-labelledby="titulo-crear">
          <h3 id="titulo-crear" className="hoja-titulo">Crear cuenta</h3>
          <form onSubmit={crear}>
            <label className="campo">Nombre
              <input value={formulario.nombre}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} required />
            </label>
            <label className="campo">Usuario
              <input value={formulario.usuario}
                onChange={(e) => setFormulario({ ...formulario, usuario: e.target.value })} required />
            </label>
            <label className="campo">Rol
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
            {formulario.rol === 'administrador' && (
              <label className="campo">Contraseña (mínimo 8 caracteres)
                <input type="password" value={formulario.password ?? ''}
                  onChange={(e) => setFormulario({ ...formulario, password: e.target.value })}
                  required minLength={8} />
              </label>
            )}
            {formulario.rol === 'cajero' && (
              <p className="ayuda">
                El sistema generará una contraseña temporal. El cajero la cambiará en su primer ingreso.
              </p>
            )}
            <button type="submit" className="boton">Crear cuenta</button>
          </form>
        </section>

        <div>
          <h3 className="pagina-subtitulo">Cuentas existentes</h3>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
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
                      <td>
                        {cuenta.nombre}
                        <div className="nota-bloqueo">{cuenta.usuario}</div>
                      </td>
                      <td>
                        <span className="chip">
                          {cuenta.rol === 'administrador' ? 'Administrador' : 'Cajero'}
                        </span>
                      </td>
                      <td>
                        <span className={cuenta.activo ? 'chip' : 'chip chip--apagado'}>
                          {cuenta.activo ? 'Activa' : 'Desactivada'}
                        </span>
                      </td>
                      <td>{formatearFecha(cuenta.actualizado_en)}</td>
                      <td>
                        <div className="acciones">
                          <button type="button" className="boton boton--pequeno boton--secundario"
                            onClick={() => cambiarEstado(cuenta)} disabled={bloqueada}
                            title={bloqueada ? avisoBloqueo : undefined}>
                            {cuenta.activo ? 'Desactivar' : 'Activar'}
                          </button>
                          <button type="button" className="boton boton--pequeno boton--secundario"
                            onClick={() => restablecer(cuenta)} disabled={bloqueada}
                            title={bloqueada ? avisoBloqueo : undefined}>
                            Restablecer contraseña
                          </button>
                        </div>
                        {bloqueada && <p className="nota-bloqueo">Es el único Administrador activo.</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RNF-2: el secreto se muestra una sola vez y bloquea la pantalla
          hasta que el administrador confirma que lo guardó. */}
      {secreto && (
        <div className="velo">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-secreto" className="sobre">
            <h3 id="titulo-secreto">Guarda este dato ahora</h3>
            <p className="sobre-etiqueta">{secreto.etiqueta}</p>
            <p className="sobre-valor">{secreto.valor}</p>
            <p><strong>No se volverá a mostrar.</strong> Guárdalo en un lugar seguro antes de continuar.</p>
            <button type="button" className="boton" onClick={() => setSecreto(null)}>
              Ya lo guardé
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
