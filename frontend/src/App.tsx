// Definición de rutas y navegación según rol (spec 001, RF-5, RF-9 a RF-11).
import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { RutaProtegida } from './components/RutaProtegida';
import { ResumenStock } from './components/ResumenStock';
import { VistaLogin } from './views/LoginView';
import { VistaPuntoVenta } from './views/PuntoVentaView';
import { VistaInventario } from './views/InventarioView';
import { VistaClientes } from './views/ClientesView';
import { VistaCuentaCliente } from './views/CuentaClienteView';
import { VistaReportes } from './views/ReportesView';
import { VistaUsuarios } from './views/UsuariosView';
import { VistaHistorialVentas } from './views/HistorialVentasView';
import { VistaCambiarContrasena } from './views/CambiarContrasenaView';
import { VistaRecuperarContrasena } from './views/RecuperarContrasenaView';
import { useAutenticacion } from './context/AutenticacionContext';
import { mensajeError } from './services/api';

export function App() {
  const { usuario, cerrarSesion } = useAutenticacion();
  const [errorCierre, setErrorCierre] = useState('');

  async function salir() {
    setErrorCierre('');
    try {
      await cerrarSesion();
    } catch (err) {
      // El backend rechaza el cierre si hay una venta en curso (RF-23).
      setErrorCierre(mensajeError(err));
    }
  }

  // Con contraseña temporal, la única pantalla permitida es el cambio de clave (RF-13).
  if (usuario?.requiereCambioContrasena) {
    return <VistaCambiarContrasena />;
  }

  return (
    <>
      {usuario && (
        <nav className="app-nav" aria-label="Principal">
          <span className="app-marca">AlmacenPro</span>
          {/* RF-17: se ve quién opera y con qué rol en un mesón compartido. */}
          <span className="app-sesion">
            Sesión: {usuario.nombre} ({usuario.rol === 'administrador' ? 'Administrador' : 'Cajero'})
          </span>
          <div className="app-enlaces">
            <NavLink to="/ventas">Ventas</NavLink>
            <NavLink to="/inventario">Inventario</NavLink>
            {/* Spec 004: el cajero también atiende a los clientes y anota sus abonos. */}
            <NavLink to="/clientes">Clientes y fiado</NavLink>
            {usuario.rol === 'administrador' && (
              <>
                <NavLink to="/historial-ventas">Historial</NavLink>
                <NavLink to="/reportes">Reportes</NavLink>
                <NavLink to="/usuarios">Cuentas</NavLink>
              </>
            )}
          </div>
          <button type="button" className="app-salir" onClick={salir}>Cerrar sesión</button>
        </nav>
      )}
      {errorCierre && <p role="alert" className="alerta alerta--error app-alerta">{errorCierre}</p>}

      <div className="app-contenido">
        <Routes>
          <Route path="/login" element={usuario ? <Navigate to="/ventas" replace /> : <VistaLogin />} />
          <Route path="/recuperar-contrasena" element={<VistaRecuperarContrasena />} />
          <Route path="/cambiar-contrasena" element={
            <RutaProtegida><VistaCambiarContrasena /></RutaProtegida>
          } />
          <Route path="/ventas" element={
            <RutaProtegida>
              {/* RF-33: al ingresar se ve cuántos productos necesitan reposición. */}
              <ResumenStock />
              <VistaPuntoVenta />
            </RutaProtegida>
          } />
          <Route path="/inventario" element={
            <RutaProtegida>
              <VistaInventario soloLectura={usuario?.rol === 'cajero'} />
            </RutaProtegida>
          } />
          <Route path="/clientes" element={<RutaProtegida><VistaClientes /></RutaProtegida>} />
          <Route path="/clientes/:id" element={<RutaProtegida><VistaCuentaCliente /></RutaProtegida>} />
          <Route path="/historial-ventas" element={
            <RutaProtegida rolesPermitidos={['administrador']}><VistaHistorialVentas /></RutaProtegida>
          } />
          <Route path="/reportes" element={
            <RutaProtegida rolesPermitidos={['administrador']}><VistaReportes /></RutaProtegida>
          } />
          <Route path="/usuarios" element={
            <RutaProtegida rolesPermitidos={['administrador']}><VistaUsuarios /></RutaProtegida>
          } />
          <Route path="*" element={<Navigate to="/ventas" replace />} />
        </Routes>
      </div>
    </>
  );
}
