// Inventario: consulta de stock. El cajero solo puede leer (spec 001, RF-10).
import { useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import type { Producto } from '../types';

interface Props {
  soloLectura?: boolean;
}

export function VistaInventario({ soloLectura = false }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
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
      <ul>
        {productos.map((producto) => (
          <li key={producto.id}>
            {producto.nombre} — Stock: {producto.stock} {producto.unidad_medida}
          </li>
        ))}
      </ul>
    </section>
  );
}
