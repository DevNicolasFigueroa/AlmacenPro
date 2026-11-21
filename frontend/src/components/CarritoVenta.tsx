// La boleta del mesón (spec 003, RF-6, RF-11, RF-12): líneas del carrito con su subtotal y,
// abajo, el total en grande para decírselo al cliente a distancia.
// La cantidad se edita en la propia línea; el precio es el congelado al agregar el producto.
import { useState } from 'react';
import { formatearClp, parsearCantidad } from '../utils/formato';
import type { LineaVenta } from '../types';
import '../styles/ventas.css';

interface Props {
  numero: number;
  lineas: LineaVenta[];
  total: number;
  deshabilitado?: boolean;
  onCambiarCantidad: (linea: LineaVenta, cantidad: number) => Promise<boolean>;
  onQuitar: (linea: LineaVenta) => void;
  onVaciar: () => void;
  onCancelar: () => void;
  onCobrar?: () => void;
}

interface FilaProps {
  linea: LineaVenta;
  deshabilitado: boolean;
  onCambiarCantidad: Props['onCambiarCantidad'];
  onQuitar: Props['onQuitar'];
}

function FilaBoleta({ linea, deshabilitado, onCambiarCantidad, onQuitar }: FilaProps) {
  const [texto, setTexto] = useState<string | null>(null); // null = se muestra el valor guardado
  const [error, setError] = useState('');
  const kilo = linea.unidad_medida === 'kilo';
  const valorGuardado = kilo
    ? String(linea.cantidad).replace('.', ',')
    : String(linea.cantidad);

  // Se confirma al salir del campo o con Enter; si no cambió, no se llama al servidor.
  async function confirmar() {
    if (texto === null || texto.trim() === valorGuardado) { setTexto(null); setError(''); return; }
    const lectura = parsearCantidad(texto, linea.unidad_medida);
    if ('error' in lectura) { setError(lectura.error); return; }
    if (lectura.valor <= 0) { setError('La cantidad debe ser mayor a 0'); return; }
    setError('');
    // Si el servidor la rechaza, el campo vuelve a la cantidad guardada y el motivo se muestra arriba.
    await onCambiarCantidad(linea, lectura.valor);
    setTexto(null);
  }

  return (
    <li className="boleta-linea">
      <div className="boleta-producto">
        <span className="boleta-nombre">{linea.nombre}</span>
        <span className="boleta-precio">
          {formatearClp(linea.precio_unitario)} {kilo ? 'el kilo' : 'c/u'}
        </span>
        {!linea.activo && <span className="chip chip--apagado">Desactivado</span>}
      </div>

      <div className="boleta-cantidad">
        <input value={texto ?? valorGuardado} disabled={deshabilitado}
          inputMode={kilo ? 'decimal' : 'numeric'}
          aria-label={`Cantidad de ${linea.nombre}${kilo ? ' en kilos' : ''}`}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } }} />
        <span className="boleta-unidad">{kilo ? 'kg' : 'u.'}</span>
      </div>

      <div className="boleta-subtotal">{formatearClp(linea.subtotal)}</div>

      <button type="button" className="boleta-quitar" disabled={deshabilitado}
        aria-label={`Quitar ${linea.nombre} de la venta`} onClick={() => onQuitar(linea)}>
        ×
      </button>

      {error && <p role="alert" className="error-campo boleta-error">{error}</p>}
    </li>
  );
}

export function CarritoVenta({
  numero, lineas, total, deshabilitado = false,
  onCambiarCantidad, onQuitar, onVaciar, onCancelar, onCobrar,
}: Props) {
  const vacia = lineas.length === 0;

  return (
    <section className="boleta" aria-label={`Venta n.º ${numero}`}>
      <header className="boleta-cabecera">
        <h3>Venta n.º {numero}</h3>
        <span>{vacia ? 'Sin productos' : `${lineas.length} ${lineas.length === 1 ? 'producto' : 'productos'}`}</span>
      </header>

      {vacia ? (
        <p className="boleta-vacia">
          Busca un producto y agrégalo. Escribir un código de barras y presionar Enter lo agrega solo.
        </p>
      ) : (
        <ul className="boleta-lineas">
          {lineas.map((linea) => (
            <FilaBoleta key={linea.producto_id} linea={linea} deshabilitado={deshabilitado}
              onCambiarCantidad={onCambiarCantidad} onQuitar={onQuitar} />
          ))}
        </ul>
      )}

      <div className="boleta-total" aria-live="polite">
        <span>Total</span>
        <strong>{formatearClp(total)}</strong>
      </div>

      <div className="boleta-acciones">
        {onCobrar && (
          <button type="button" className="boton boton--cobrar" disabled={deshabilitado || vacia}
            onClick={onCobrar}>
            Cobrar
          </button>
        )}
        <button type="button" className="boton boton--secundario boton--pequeno"
          disabled={deshabilitado || vacia} onClick={onVaciar}>
          Vaciar carrito
        </button>
        <button type="button" className="boton boton--peligro boton--pequeno"
          disabled={deshabilitado} onClick={onCancelar}>
          Cancelar venta
        </button>
      </div>
    </section>
  );
}
