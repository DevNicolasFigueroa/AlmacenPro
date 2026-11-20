// Contenedor de ventana modal con las clases "velo" y "sobre" de la gestión de cuentas.
// Se cierra con la tecla Escape o con el botón "Cerrar".
import { useEffect, type ReactNode } from 'react';

interface Props {
  titulo: string;
  idTitulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

export function Modal({ titulo, idTitulo, onCerrar, children }: Props) {
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div className="velo">
      <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} className="sobre sobre--ancho">
        <h3 id={idTitulo}>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}
