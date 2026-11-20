// Contexto global de autenticación: guarda usuario, rol, token y cierre de sesión.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from '../services/api';
import type { Usuario } from '../types';

interface ContextoAutenticacion {
  usuario: Usuario | null;
  iniciarSesion: (usuario: Usuario, token: string) => void;
  cerrarSesion: () => Promise<void>;
  limpiarSesionLocal: () => void;
}

const Contexto = createContext<ContextoAutenticacion | null>(null);

export function ProveedorAutenticacion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const guardado = localStorage.getItem('almacenpro_usuario');
    return guardado ? (JSON.parse(guardado) as Usuario) : null;
  });

  function iniciarSesion(nuevoUsuario: Usuario, token: string) {
    localStorage.setItem('almacenpro_token', token);
    localStorage.setItem('almacenpro_usuario', JSON.stringify(nuevoUsuario));
    setUsuario(nuevoUsuario);
  }

  function limpiarSesionLocal() {
    localStorage.removeItem('almacenpro_token');
    localStorage.removeItem('almacenpro_usuario');
    setUsuario(null);
  }

  // El backend rechaza el cierre si hay una venta en curso (RF-23).
  // En ese caso se propaga el error y se conserva la sesión.
  async function cerrarSesion() {
    await api.post('/auth/logout');
    limpiarSesionLocal();
  }

  return (
    <Contexto.Provider value={{ usuario, iniciarSesion, cerrarSesion, limpiarSesionLocal }}>
      {children}
    </Contexto.Provider>
  );
}

export function useAutenticacion(): ContextoAutenticacion {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useAutenticacion debe usarse dentro de ProveedorAutenticacion');
  }
  return contexto;
}
