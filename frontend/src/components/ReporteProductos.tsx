// Productos (spec 005, RF-14, RF-15): los más vendidos del período, por monto (hay productos por unidad y
// por kilo, así que ordenar por cantidad mezclaría unidades), incluidos los que después se desactivaron,
// y los productos por reponer: primero los agotados y luego los de stock bajo, para decidir qué comprar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatearCantidad, formatearClp } from '../utils/formato';
import { useReporte } from '../utils/useReporte';
import { etiquetaPeriodo } from './ReporteVentas';
import type { Periodo } from '../utils/periodo';
import type { ReporteMasVendidos, ReportePorReponer } from '../types';
import '../styles/reportes.css';

interface Props {
  periodo: Periodo;
  valido: boolean;
}

const LIMITES = [10, 25, 50];

export function ReporteProductosPeriodo({ periodo, valido }: Props) {
  const [limite, setLimite] = useState(10);
  const vendidos = useReporte<ReporteMasVendidos>(
    valido ? '/reportes/mas-vendidos' : null,
    valido ? { desde: periodo.desde, hasta: periodo.hasta, limite } : undefined
  );
  const reponer = useReporte<ReportePorReponer>('/reportes/por-reponer');

  return (
    <div className="reporte-rejilla reporte-rejilla--productos">
      <section className="reporte-tarjeta">
        <div className="reporte-cabecera">
          <h3 className="reporte-titulo">
            Más vendidos {vendidos.datos ? etiquetaPeriodo(vendidos.datos.desde, vendidos.datos.hasta) : ''}
          </h3>
          <label className="campo campo--chico">
            Mostrar
            <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
              {LIMITES.map((n) => <option key={n} value={n}>{n} productos</option>)}
            </select>
          </label>
        </div>
        {!valido && <p className="pagina-descripcion">Corrige el período para ver los productos.</p>}
        {valido && vendidos.error && <p role="alert" className="alerta alerta--error">{vendidos.error}</p>}
        {valido && !vendidos.error && !vendidos.datos && <p className="pagina-descripcion">Cargando…</p>}
        {valido && vendidos.datos && vendidos.datos.productos.length === 0 && (
          <p className="pagina-descripcion">No se vendió ningún producto en este período.</p>
        )}
        {valido && vendidos.datos && vendidos.datos.productos.length > 0 && (
          <table className="tabla tabla-reporte">
            <thead>
              <tr><th>Producto</th><th className="numero">Cantidad</th><th className="numero">Vendido</th></tr>
            </thead>
            <tbody>
              {vendidos.datos.productos.map((producto, indice) => (
                <tr key={producto.producto_id}>
                  <td>
                    <span className="posicion">{indice + 1}</span>
                    {producto.nombre}
                    {!producto.activo && <span className="chip chip--apagado chip--costo">Desactivado</span>}
                  </td>
                  <td className="numero">{formatearCantidad(producto.cantidad, producto.unidad_medida)}</td>
                  <td className="numero">{formatearClp(producto.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="reporte-tarjeta">
        <h3 className="reporte-titulo">Por reponer</h3>
        {reponer.error && <p role="alert" className="alerta alerta--error">{reponer.error}</p>}
        {!reponer.error && !reponer.datos && <p className="pagina-descripcion">Cargando…</p>}
        {reponer.datos && reponer.datos.productos.length === 0 && (
          <p className="pagina-descripcion">No hay productos agotados ni con stock bajo.</p>
        )}
        {reponer.datos && reponer.datos.productos.length > 0 && (
          <>
            <p className="ayuda">
              {reponer.datos.resumen.agotados} agotados y {reponer.datos.resumen.stock_bajo} con stock bajo.{' '}
              <Link to="/inventario?estado=agotado" className="enlace-fila">Ver agotados</Link>{' · '}
              <Link to="/inventario?estado=bajo" className="enlace-fila">Ver stock bajo</Link>
            </p>
            <table className="tabla tabla-reporte">
              <thead>
                <tr><th>Producto</th><th className="numero">Stock</th><th className="numero">Mínimo</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {reponer.datos.productos.map((producto) => (
                  <tr key={producto.id}>
                    <td>{producto.nombre}</td>
                    <td className="numero">{formatearCantidad(producto.stock, producto.unidad_medida)}</td>
                    <td className="numero">{formatearCantidad(producto.stock_minimo, producto.unidad_medida)}</td>
                    <td>
                      {producto.estado === 'agotado'
                        ? <span className="chip chip--peligro">Agotado</span>
                        : <span className="chip chip--alerta">Stock bajo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
