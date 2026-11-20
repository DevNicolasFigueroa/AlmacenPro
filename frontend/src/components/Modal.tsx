// Ventana modal con cabecera en verde botella. Usa el fondo "velo" de la gestión de
// cuentas y se cierra con la tecla Escape, con la X o con el botón de cancelar.
import { useEffect, type ReactNode } from 'react';
import '../styles/inventario.css';

interface Props {
  titulo: string;
  subtitulo?: string;
  idTitulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

export function Modal({ titulo, subtitulo, idTitulo, onCerrar, children }: Props) {
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div className="velo">
      <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} className="ventana">
        <header className="modal-cabecera">
          <div>
            <h3 id={idTitulo}>{titulo}</h3>
            {subtitulo && <p className="modal-subtitulo">{subtitulo}</p>}
          </div>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar ventana">
            ×
          </button>
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}
