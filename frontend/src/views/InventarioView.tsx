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
    <section>
      <h2>Inventario</h2>
      {soloLectura
        ? <p>Consulta de stock: solo lectura para cajeros.</p>
        : <p>Consulta de stock. La edición de productos pertenece a otra spec.</p>}
      <label>
        Buscar producto
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            {esAdministrador && <th>Costo</th>}
            <th>Precio de venta</th>
            {esAdministrador && <th>Margen</th>}
            <th>Stock</th>
            <th>Unidad</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => (
            <tr key={producto.id}>
              <td>{producto.nombre}</td>
              {esAdministrador && <td>{formatearClp(producto.precio_costo)}</td>}
              <td>{formatearClp(producto.precio_venta)}</td>
              {esAdministrador && (
                <td>
                  {formatearClp(
                    Number(producto.precio_venta) - Number(producto.precio_costo ?? 0)
                  )}
                </td>
              )}
              <td>{producto.stock}</td>
              <td>{producto.unidad_medida}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {productos.length === 0 && !error && <p>No hay productos para mostrar.</p>}
    </section>
  );
}
