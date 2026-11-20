// Inventario: consulta de stock con columnas según el rol (spec 001, RF-10 a RF-12).
// El backend omite "precio_costo" para el cajero; aquí solo se decide qué columnas mostrar.
import { useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import type { Producto } from '../types';

interface Props {
  soloLectura?: boolean;
}

function formatearClp(valor: string | number | undefined) {
  return Number(valor ?? 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });
}

// La barra compara el stock con tres veces el mínimo del producto; por debajo del mínimo se marca.
function EstadoStock({ producto }: { producto: Producto }) {
  const bajo = producto.stock <= producto.stock_minimo;
  const referencia = Math.max(producto.stock_minimo * 3, producto.stock, 1);
  const porcentaje = Math.round((producto.stock / referencia) * 100);

  return (
    <div className={bajo ? 'stock stock--bajo' : 'stock'}>
      <span className="stock-cifra">
        {producto.stock}
        {bajo && <span className="chip chip--peligro" style={{ marginLeft: 8 }}>Stock bajo</span>}
      </span>
      <div
        className="stock-barra"
        role="img"
        aria-label={`Stock al ${porcentaje}% de la referencia. Mínimo: ${producto.stock_minimo}`}
      >
        <span style={{ width: `${Math.min(porcentaje, 100)}%` }} />
      </div>
    </div>
  );
}

export function VistaInventario({ soloLectura = false }: Props) {
  const { usuario } = useAutenticacion();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');

  const esAdministrador = usuario?.rol === 'administrador';

  useEffect(() => {
    setError('');
    api.get<Producto[]>('/productos', { params: { buscar: busqueda } })
      .then(({ data }) => setProductos(data))
      .catch((err) => setError(mensajeError(err)));
  }, [busqueda]);

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
      </header>

      <label className="campo">
        Buscar producto
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {productos.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                {esAdministrador && <th className="numero">Costo</th>}
                <th className="numero">Precio de venta</th>
                {esAdministrador && <th className="numero">Margen</th>}
                <th>Stock</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td>{producto.nombre}</td>
                  {esAdministrador && (
                    <td className="numero">{formatearClp(producto.precio_costo)}</td>
                  )}
                  <td className="numero">{formatearClp(producto.precio_venta)}</td>
                  {esAdministrador && (
                    <td className="numero">
                      {formatearClp(
                        Number(producto.precio_venta) - Number(producto.precio_costo ?? 0)
                      )}
                    </td>
                  )}
                  <td><EstadoStock producto={producto} /></td>
                  <td>{producto.unidad_medida}</td>
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
            {busqueda
              ? `Ningún producto coincide con "${busqueda}". Revisa la búsqueda.`
              : 'Cuando se carguen productos en el almacén, aparecerán aquí con su stock.'}
          </p>
        </div>
      )}
    </section>
  );
}
