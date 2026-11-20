// Protege las vistas según sesión activa y rol permitido.
import { Navigate } from 'react-router-dom';
import { useAutenticacion } from '../context/AutenticacionContext';
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

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    // El cajero cae siempre en el POS; el resto de módulos es del administrador
    return <Navigate to="/ventas" replace />;
  }

  return <>{children}</>;
}
