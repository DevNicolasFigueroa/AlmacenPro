// Protege las vistas según sesión activa y rol permitido.
import { Navigate } from 'react-router-dom';
import { useAutenticacion } from '../context/AutenticacionContext';
import { SinPermisos } from './SinPermisos';
import type { Rol } from '../types';

interface Props {
  rolesPermitidos?: Rol[];
  children: React.ReactNode;
}

export function RutaProtegida({ rolesPermitidos, children }: Props) {
  const { usuario } = useAutenticacion();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // RF-14: el cajero que escribe la URL de un módulo reservado ve una
  // explicación clara en la misma ruta; no se lo redirige en silencio.
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    return <SinPermisos />;
  }

  return <>{children}</>;
}
