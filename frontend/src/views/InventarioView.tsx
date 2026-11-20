// Inventario: listado con filtros, estado de stock y acciones según el rol
// (spec 001, RF-10 a RF-12; spec 002, RF-17 a RF-21 y RF-31).
// El backend omite "precio_costo" para el cajero y calcula "estado_stock";
// aquí solo se decide qué columnas y botones mostrar.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import { formatearCantidad, formatearClp } from '../utils/formato';
import { FormularioProducto } from '../components/FormularioProducto';
import { AjusteStockModal } from '../components/AjusteStockModal';
import { HistorialStockModal } from '../components/HistorialStockModal';
import type { Categoria, EstadoStock, Producto } from '../types';

interface Props {
  soloLectura?: boolean;
}

// Ventana abierta sobre el listado (solo administrador).
type Ventana =
  | { tipo: 'formulario'; producto?: Producto }
  | { tipo: 'ajuste'; producto: Producto }
  | { tipo: 'historial'; producto: Producto }
  | null;

const FILTROS_DE_ESTADO = ['bajo', 'agotado'];

// RF-31, RF-34: agotado, stock bajo o no disponible (desactivado). Normal no lleva etiqueta.
function EtiquetaEstado({ estado }: { estado: EstadoStock }) {
  if (estado === 'agotado') return <span className="chip chip--peligro">Agotado</span>;
  if (estado === 'bajo') return <span className="chip chip--alerta">Stock bajo</span>;
  if (estado === 'sin_alerta') return <span className="chip chip--apagado">No disponible</span>;
  return null;
}

export function VistaInventario({ soloLectura = false }: Props) {
  const { usuario } = useAutenticacion();
  const [parametros, setParametros] = useSearchParams();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [ventana, setVentana] = useState<Ventana>(null);

  const esAdministrador = usuario?.rol === 'administrador';
  const estadoParametro = parametros.get('estado') ?? '';
  const estadoFiltro = FILTROS_DE_ESTADO.includes(estadoParametro) ? estadoParametro : '';

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get<Producto[]>('/productos', {
        params: {
          buscar: busqueda || undefined,
          categoria: categoria || undefined,
          estadoStock: estadoFiltro || undefined,
        },
      });
      setProductos(data);
    } catch (err) {
      setError(mensajeError(err));
    }
  }, [busqueda, categoria, estadoFiltro]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    api.get<Categoria[]>('/productos/categorias')
      .then(({ data }) => setCategorias(data))
      .catch((err) => setError(mensajeError(err)));
  }, []);

  function cambiarEstadoFiltro(valor: string) {
    const siguiente = new URLSearchParams(parametros);
    if (valor) siguiente.set('estado', valor);
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

  const hayFiltros = Boolean(busqueda || categoria || estadoFiltro);

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Inventario</h2>
          <p className="pagina-descripcion">
            {soloLectura
              ? 'Consulta el stock disponible. Los costos solo los ve el administrador.'
              : 'Stock, precios y margen de cada producto.'}
          </p>
        </div>
        {esAdministrador && (
          <button type="button" className="boton" onClick={() => setVentana({ tipo: 'formulario' })}>
            Nuevo producto
          </button>
        )}
      </header>

      <div className="campo-fila filtros">
        <label className="campo">
          Buscar producto
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre o código de barras" />
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
        <label className="campo">
          Estado del stock
          <select value={estadoFiltro} onChange={(e) => cambiarEstadoFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="bajo">Stock bajo</option>
            <option value="agotado">Agotados</option>
          </select>
        </label>
      </div>

      {mensaje && <p role="status" className="alerta alerta--ok">{mensaje}</p>}
      {avisos.map((aviso) => (
        <p key={aviso} role="status" className="alerta alerta--aviso">{aviso}</p>
      ))}
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {productos.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                {esAdministrador && <th className="numero">Costo</th>}
                <th className="numero">Precio de venta</th>
                {esAdministrador && <th className="numero">Margen</th>}
                <th>Stock</th>
                <th>Estado</th>
                {esAdministrador && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id} className={producto.activo ? undefined : 'fila--apagada'}>
                  <td>
                    {producto.nombre}
                    {producto.codigo_barras && (
                      <div className="nota-bloqueo">{producto.codigo_barras}</div>
                    )}
                  </td>
                  <td>{producto.categoria ?? 'Sin categoría'}</td>
                  {esAdministrador && (
                    <td className="numero">{formatearClp(producto.precio_costo)}</td>
                  )}
                  <td className="numero">{formatearClp(producto.precio_venta)}</td>
                  {esAdministrador && (
                    <td className="numero">
                      {formatearClp(producto.precio_venta - (producto.precio_costo ?? 0))}
                    </td>
                  )}
                  <td>
                    <span className="stock-cifra">
                      {formatearCantidad(producto.stock, producto.unidad_medida)}
                    </span>
                    {producto.stock_minimo > 0 && (
                      <div className="nota-bloqueo">
                        Mínimo: {formatearCantidad(producto.stock_minimo, producto.unidad_medida)}
                      </div>
                    )}
                  </td>
                  <td><EtiquetaEstado estado={producto.estado_stock} /></td>
                  {esAdministrador && (
                    <td>
                      <div className="acciones">
                        <button type="button" className="boton boton--pequeno boton--secundario"
                          onClick={() => setVentana({ tipo: 'formulario', producto })}>
                          Editar
                        </button>
                        <button type="button" className="boton boton--pequeno boton--secundario"
                          onClick={() => setVentana({ tipo: 'ajuste', producto })}>
                          Ajustar stock
                        </button>
                        <button type="button" className="boton boton--pequeno boton--secundario"
                          onClick={() => setVentana({ tipo: 'historial', producto })}>
                          Historial
                        </button>
                        <button type="button" className="boton boton--pequeno boton--secundario"
                          onClick={() => cambiarActivo(producto)}>
                          {producto.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {productos.length === 0 && !error && (
        <div className="vacio">
          <strong>No hay productos para mostrar</strong>
          <p>
            {hayFiltros
              ? 'Ningún producto coincide con los filtros. Revisa la búsqueda.'
              : 'Cuando se carguen productos en el almacén, aparecerán aquí con su stock.'}
          </p>
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
