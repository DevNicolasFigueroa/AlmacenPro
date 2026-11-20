// Inventario: listado con filtros, medidor de stock y acciones según el rol
// (spec 001, RF-10 a RF-12; spec 002, RF-17 a RF-21 y RF-31).
// El backend omite "precio_costo" para el cajero y calcula "estado_stock";
// aquí solo se decide qué columnas y botones mostrar.
import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import { formatearClp } from '../utils/formato';
import { FormularioProducto } from '../components/FormularioProducto';
import { AjusteStockModal } from '../components/AjusteStockModal';
import { HistorialStockModal } from '../components/HistorialStockModal';
import { MedidorStock } from '../components/MedidorStock';
import type { Categoria, EstadoStock, Producto } from '../types';
import '../styles/inventario.css';

interface Props {
  soloLectura?: boolean;
}

// Ventana abierta sobre el listado (solo administrador).
type Ventana =
  | { tipo: 'formulario'; producto?: Producto }
  | { tipo: 'ajuste'; producto: Producto }
  | { tipo: 'historial'; producto: Producto }
  | null;

type Segmento = '' | 'bajo' | 'agotado' | 'no-disponible';

const SEGMENTOS: { clave: Segmento; texto: string }[] = [
  { clave: '', texto: 'Todos' },
  { clave: 'bajo', texto: 'Stock bajo' },
  { clave: 'agotado', texto: 'Agotados' },
  { clave: 'no-disponible', texto: 'No disponibles' },
];

function perteneceA(producto: Producto, segmento: Segmento) {
  if (segmento === '') return true;
  if (segmento === 'no-disponible') return !producto.activo;
  return producto.estado_stock === segmento;
}

// RF-31, RF-34: agotado, stock bajo o no disponible (desactivado). Normal no lleva etiqueta.
function EtiquetaEstado({ estado }: { estado: EstadoStock }) {
  if (estado === 'agotado') return <span className="chip chip--peligro">Agotado</span>;
  if (estado === 'bajo') return <span className="chip chip--alerta">Stock bajo</span>;
  if (estado === 'sin_alerta') return <span className="chip chip--apagado">No disponible</span>;
  return null;
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

// El menú "Más" se cierra al elegir una opción.
function cerrarMenu(evento: MouseEvent<HTMLElement>) {
  evento.currentTarget.closest('details')?.removeAttribute('open');
}

export function VistaInventario({ soloLectura = false }: Props) {
  const { usuario } = useAutenticacion();
  const [parametros, setParametros] = useSearchParams();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [categoria, setCategoria] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [ventana, setVentana] = useState<Ventana>(null);

  const esAdministrador = usuario?.rol === 'administrador';
  const parametro = (parametros.get('estado') ?? '') as Segmento;
  const segmento: Segmento = SEGMENTOS.some((s) => s.clave === parametro) ? parametro : '';

  // Espera un instante tras la última tecla para no consultar en cada letra.
  useEffect(() => {
    const espera = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 250);
    return () => window.clearTimeout(espera);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get<Producto[]>('/productos', {
        params: { buscar: busquedaAplicada || undefined, categoria: categoria || undefined },
      });
      setProductos(data);
    } catch (err) {
      setError(mensajeError(err));
    }
  }, [busquedaAplicada, categoria]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    api.get<Categoria[]>('/productos/categorias')
      .then(({ data }) => setCategorias(data))
      .catch((err) => setError(mensajeError(err)));
  }, []);

  // Cierra cualquier menú "Más" abierto al hacer clic fuera de él.
  useEffect(() => {
    function alHacerClic(evento: Event) {
      document.querySelectorAll<HTMLDetailsElement>('details.mas[open]').forEach((menu) => {
        if (!menu.contains(evento.target as Node)) menu.removeAttribute('open');
      });
    }
    document.addEventListener('click', alHacerClic);
    return () => document.removeEventListener('click', alHacerClic);
  }, []);

  function elegirSegmento(clave: Segmento) {
    const siguiente = new URLSearchParams(parametros);
    if (clave) siguiente.set('estado', clave);
    else siguiente.delete('estado');
    setParametros(siguiente, { replace: true });
  }

  // RF-13, RF-14: desactivar o reactivar; el stock y el historial no cambian.
  async function cambiarActivo(producto: Producto) {
    setError('');
    setMensaje('');
    try {
      const { data } = await api.patch<{ mensaje: string }>(
        `/productos/${producto.id}/estado`,
        { activo: !producto.activo }
      );
      setMensaje(`${data.mensaje}: ${producto.nombre}`);
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  function alGuardar(texto: string, avisosRecibidos: string[] = []) {
    setMensaje(texto);
    setAvisos(avisosRecibidos);
    setVentana(null);
    cargar();
  }

  const visibles = productos.filter((producto) => perteneceA(producto, segmento));
  const hayFiltros = Boolean(busquedaAplicada || categoria || segmento);

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Inventario</h2>
          <p className="pagina-descripcion">
            {soloLectura
              ? 'Consulta el stock disponible. Los costos solo los ve el administrador.'
              : 'Qué hay en el almacén, a qué precio y qué conviene reponer.'}
          </p>
        </div>
        {esAdministrador && (
          <button type="button" className="boton" onClick={() => setVentana({ tipo: 'formulario' })}>
            Nuevo producto
          </button>
        )}
      </header>

      <div className="herramientas">
        <label className="campo">
          Buscar producto
          <div className="buscador">
            <IconoLupa />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o código de barras" />
          </div>
        </label>
        <label className="campo">
          Categoría
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="segmentos" role="group" aria-label="Filtrar por estado del stock">
        {SEGMENTOS.map(({ clave, texto }) => {
          const cuenta = productos.filter((producto) => perteneceA(producto, clave)).length;
          return (
            <button key={clave || 'todos'} type="button"
              className={`segmento segmento--${clave || 'todos'}`}
              aria-pressed={segmento === clave}
              onClick={() => elegirSegmento(clave)}>
              {texto}
              <span className={cuenta > 0 ? 'segmento-cuenta tiene' : 'segmento-cuenta'}>{cuenta}</span>
            </button>
          );
        })}
      </div>

      {mensaje && <p role="status" className="alerta alerta--ok">{mensaje}</p>}
      {avisos.map((aviso) => (
        <p key={aviso} role="status" className="alerta alerta--aviso">{aviso}</p>
      ))}
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {visibles.length > 0 && (
        <div className="tabla-contenedor tabla-contenedor--libre">
          <table className="tabla tabla-inventario">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="numero">Precio</th>
                {esAdministrador && <th className="numero">Margen</th>}
                <th>Stock</th>
                {esAdministrador && <th><span className="visualmente-oculto">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((producto) => {
                const costo = producto.precio_costo ?? 0;
                const margen = producto.precio_venta - costo;
                const porcentaje = producto.precio_venta > 0
                  ? Math.round((margen / producto.precio_venta) * 100)
                  : 0;
                return (
                  <tr key={producto.id} className={producto.activo ? undefined : 'fila--apagada'}>
                    <td className="celda-producto">
                      <div className="producto-nombre">{producto.nombre}</div>
                      <div className="producto-detalle">{producto.categoria ?? 'Sin categoría'}</div>
                      {producto.codigo_barras && (
                        <div className="producto-detalle">{producto.codigo_barras}</div>
                      )}
                    </td>
                    <td className="numero" data-etiqueta="Precio">
                      <div className="precio-venta">{formatearClp(producto.precio_venta)}</div>
                      {esAdministrador && (
                        <div className="producto-detalle">Costo {formatearClp(costo)}</div>
                      )}
                    </td>
                    {esAdministrador && (
                      <td className={`numero ${margen < 0 ? 'margen--negativo' : ''}`} data-etiqueta="Margen">
                        {formatearClp(margen)}
                        <span className="margen-pct">{porcentaje} %</span>
                      </td>
                    )}
                    <td className="celda-stock" data-etiqueta="Stock">
                      <div className="stock-celda">
                        <MedidorStock producto={producto}
                          etiqueta={<EtiquetaEstado estado={producto.estado_stock} />} />
                      </div>
                    </td>
                    {esAdministrador && (
                      <td className="celda-acciones">
                        <div className="acciones">
                          <button type="button" className="boton boton--pequeno"
                            onClick={() => setVentana({ tipo: 'ajuste', producto })}>
                            Ajustar stock
                          </button>
                          <button type="button" className="boton boton--pequeno boton--secundario"
                            onClick={() => setVentana({ tipo: 'formulario', producto })}>
                            Editar
                          </button>
                          <details className="mas">
                            <summary className="boton boton--pequeno boton--secundario"
                              aria-label={`Más acciones para ${producto.nombre}`}>
                              Más
                            </summary>
                            <div className="mas-menu">
                              <button type="button" onClick={(e) => {
                                cerrarMenu(e);
                                setVentana({ tipo: 'historial', producto });
                              }}>
                                Ver historial
                              </button>
                              <button type="button" onClick={(e) => {
                                cerrarMenu(e);
                                cambiarActivo(producto);
                              }}>
                                {producto.activo ? 'Desactivar' : 'Reactivar'}
                              </button>
                            </div>
                          </details>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibles.length === 0 && !error && (
        <div className="vacio">
          <strong>{hayFiltros ? 'Ningún producto coincide' : 'Aún no hay productos'}</strong>
          <p>
            {hayFiltros
              ? 'Prueba con otro nombre, otra categoría o quita el filtro de estado.'
              : esAdministrador
                ? 'Crea el primer producto para empezar a controlar su stock.'
                : 'Cuando el administrador cargue productos, aparecerán aquí con su stock.'}
          </p>
          {!hayFiltros && esAdministrador && (
            <button type="button" className="boton" onClick={() => setVentana({ tipo: 'formulario' })}>
              Crear producto
            </button>
          )}
        </div>
      )}

      {esAdministrador && ventana?.tipo === 'formulario' && (
        <FormularioProducto
          producto={ventana.producto}
          categorias={categorias}
          onGuardado={alGuardar}
          onAbrirAjuste={(producto) => setVentana({ tipo: 'ajuste', producto })}
          onCerrar={() => setVentana(null)}
        />
      )}
      {esAdministrador && ventana?.tipo === 'ajuste' && (
        <AjusteStockModal
          producto={ventana.producto}
          onAjustado={alGuardar}
          onCerrar={() => setVentana(null)}
        />
      )}
      {esAdministrador && ventana?.tipo === 'historial' && (
        <HistorialStockModal producto={ventana.producto} onCerrar={() => setVentana(null)} />
      )}
    </section>
  );
}
