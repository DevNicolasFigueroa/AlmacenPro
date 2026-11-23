// Ventana modal con cabecera en verde botella. Usa el fondo "velo" de la gestión de
// cuentas y se cierra con la tecla Escape, con la X o con el botón de cancelar.
// Puede haber una ventana abierta sobre otra (por ejemplo, la cuenta de un cliente sobre el cobro de
// una venta): Escape cierra solo la de más arriba, y cada ventana se dibuja en el <body> para que
// ninguna quede recortada por la de abajo.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../styles/inventario.css';

interface Props {
  titulo: string;
  subtitulo?: string;
  idTitulo: string;
  ancha?: boolean;
  onCerrar: () => void;
  children: ReactNode;
}

// Ventanas abiertas, de la más antigua a la más reciente.
const ventanasAbiertas: symbol[] = [];

export function Modal({ titulo, subtitulo, idTitulo, ancha = false, onCerrar, children }: Props) {
  const identificador = useRef(Symbol('modal')).current;
  // Siempre se llama a la versión más reciente de onCerrar sin volver a apilar la ventana.
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  useEffect(() => {
    ventanasAbiertas.push(identificador);
    function alPresionar(evento: KeyboardEvent) {
      const esLaDeArriba = ventanasAbiertas[ventanasAbiertas.length - 1] === identificador;
      if (evento.key === 'Escape' && esLaDeArriba) alCerrar.current();
    }
    window.addEventListener('keydown', alPresionar);
    return () => {
      window.removeEventListener('keydown', alPresionar);
      ventanasAbiertas.splice(ventanasAbiertas.indexOf(identificador), 1);
    };
  }, [identificador]);

  return createPortal(
    <div className="velo">
      <div role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        className={ancha ? 'ventana ventana--ancha' : 'ventana'}>
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
    </div>,
    document.body
  );
}
