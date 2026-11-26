// Buscador del punto de venta (spec 003, RF-2, RF-3, RF-4, RF-7, RF-8).
// Busca por nombre o escribiendo el código de barras. Enter agrega el primer resultado cuando
// es un producto por unidad (1 unidad); si es por kilo, lleva al campo de cantidad.
// La validación que manda es la del backend: aquí solo se ayuda a escribir.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, mensajeError } from '../services/api';
import { formatearCantidad, formatearClp, parsearCantidad } from '../utils/formato';
import type { ProductoVendible } from '../types';
import '../styles/ventas.css';

interface Props {
  // Cantidad que cada producto ya tiene en el carrito, para avisar y no sorprender.
  enCarrito: Record<number, number>;
  deshabilitado?: boolean;
  // Devuelve true si el producto se agregó; solo entonces se limpia la búsqueda.
  onAgregar: (producto: ProductoVendible, cantidad: number) => Promise<boolean>;
}

function IconoLupa() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function BuscadorProductos({ enCarrito, deshabilitado = false, onAgregar }: Props) {
  const [texto, setTexto] = useState('');
  const [aplicado, setAplicado] = useState('');
  const [productos, setProductos] = useState<ProductoVendible[]>([]);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [errorCantidad, setErrorCantidad] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const entrada = useRef<HTMLInputElement>(null);

  // Espera un instante tras la última tecla para no consultar en cada letra.
  useEffect(() => {
    const espera = window.setTimeout(() => setAplicado(texto.trim()), 200);
    return () => window.clearTimeout(espera);
  }, [texto]);

  async function consultar(busqueda: string) {
    const { data } = await api.get<ProductoVendible[]>('/productos/vendibles', {
      params: { buscar: busqueda || undefined },
    });
    return data;
  }

  useEffect(() => {
    let vigente = true;
    consultar(aplicado)
      .then((data) => {
        if (!vigente) return;
        setProductos(data);
        setError('');
      })
      .catch((err) => { if (vigente) setError(mensajeError(err)); });
    return () => { vigente = false; };
  }, [aplicado]);

  async function agregar(producto: ProductoVendible, textoCantidad?: string) {
    const crudo = textoCantidad ?? cantidades[producto.id] ?? '';
    // Sin cantidad escrita se agrega 1 (RF-3); en kilos hay que indicarla.
    const lectura = crudo.trim() === '' && producto.unidad_medida === 'unidad'
      ? { valor: 1 }
      : parsearCantidad(crudo, producto.unidad_medida);

    if ('error' in lectura) {
      setErrorCantidad((previo) => ({ ...previo, [producto.id]: lectura.error }));
      document.getElementById(`cantidad-${producto.id}`)?.focus();
      return;
    }
    if (lectura.valor <= 0) {
      setErrorCantidad((previo) => ({ ...previo, [producto.id]: 'La cantidad debe ser mayor a 0' }));
      return;
    }

    setErrorCantidad((previo) => ({ ...previo, [producto.id]: '' }));
    if (await onAgregar(producto, lectura.valor)) {
      setTexto('');
      setCantidades((previo) => ({ ...previo, [producto.id]: '' }));
      entrada.current?.focus();
    }
  }

  // Enter en el buscador: un código de barras exacto o un único resultado se agrega de inmediato.
  // Con varios resultados por nombre no se elige por la persona: se pide elegir de la lista.
  // Se consulta con lo que está escrito ahora, sin esperar la pausa de la búsqueda.
  async function alPresionar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    const escrito = texto.trim();
    if (escrito === '') return;

    let lista = productos;
    try {
      lista = escrito === aplicado ? productos : await consultar(escrito);
    } catch (err) {
      setError(mensajeError(err));
      return;
    }
    setError('');
    setProductos(lista);
    setAplicado(escrito);

    const elegido = lista.find((producto) => producto.codigo_barras === escrito)
      ?? (lista.length === 1 ? lista[0] : null);
    if (!elegido) {
      if (lista.length > 1) setError('Hay varios productos con ese nombre: elige uno de la lista.');
      return;
    }
    if (elegido.stock <= 0) {
      setError(`«${elegido.nombre}» está agotado.`);
      return;
    }
    if (elegido.unidad_medida === 'kilo') {
      document.getElementById(`cantidad-${elegido.id}`)?.focus();
      return;
    }
    agregar(elegido, '');
  }

  return (
    <section className="buscador-venta" aria-label="Buscar productos">
      <label className="campo">
        Buscar producto
        <div className="buscador">
          <IconoLupa />
          <input ref={entrada} value={texto} autoFocus
            onChange={(e) => setTexto(e.target.value)} onKeyDown={alPresionar}
            placeholder="Nombre o código de barras" autoComplete="off" />
        </div>
      </label>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {productos.length === 0 && !error && (
        <div className="vacio vacio--compacto">
          <strong>{aplicado ? 'Ningún producto coincide' : 'Aún no hay productos'}</strong>
          <p>
            {aplicado
              ? 'Revisa el nombre o escribe el código de barras completo.'
              : 'Cuando el administrador cargue productos, podrás venderlos desde aquí.'}
          </p>
        </div>
      )}

      <ul className="resultados">
        {productos.map((producto) => {
          const agotado = producto.stock <= 0;
          const yaEnVenta = enCarrito[producto.id] ?? 0;
          const kilo = producto.unidad_medida === 'kilo';
          return (
            <li key={producto.id} className={`resultado${agotado ? ' resultado--agotado' : ''}`}>
              <div className="resultado-datos">
                <span className="resultado-nombre">{producto.nombre}</span>
                <span className="resultado-precio">
                  {formatearClp(producto.precio_venta)}{kilo ? ' el kilo' : ''}
                </span>
                <span className="resultado-detalle">
                  {agotado
                    ? 'Sin stock'
                    : `Quedan ${formatearCantidad(producto.stock, producto.unidad_medida)}${producto.estado_stock === 'bajo' ? ', stock bajo' : ''}`}
                </span>
                {yaEnVenta > 0 && (
                  <span className="resultado-detalle resultado-ya">
                    En esta venta: {formatearCantidad(yaEnVenta, producto.unidad_medida)}
                  </span>
                )}
                {errorCantidad[producto.id] && (
                  <span role="alert" className="error-campo error-campo--lista">
                    {errorCantidad[producto.id]}
                  </span>
                )}
              </div>
              <div className="resultado-accion">
                {agotado ? (
                  <span className="chip chip--peligro">Agotado</span>
                ) : (
                  <>
                    <input id={`cantidad-${producto.id}`} className="resultado-cantidad"
                      inputMode={kilo ? 'decimal' : 'numeric'}
                      value={cantidades[producto.id] ?? ''}
                      placeholder={kilo ? '0,5' : '1'}
                      aria-label={`Cantidad de ${producto.nombre}${kilo ? ' en kilos' : ''}`}
                      onChange={(e) => setCantidades((previo) => ({ ...previo, [producto.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        // En kilos, Enter sin cantidad solo espera: el error aparece al pulsar Agregar.
                        if (kilo && e.currentTarget.value.trim() === '') return;
                        agregar(producto);
                      }} />
                    <button type="button" className="boton boton--pequeno" disabled={deshabilitado}
                      onClick={() => agregar(producto)}>
                      Agregar
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
