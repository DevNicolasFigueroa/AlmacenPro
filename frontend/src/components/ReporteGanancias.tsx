// Ganancias por período (spec 005, RF-10 a RF-13): ventas, costo, ganancia y margen de las ventas con
// costo registrado, por producto de mayor a menor ganancia. Las ventas anteriores al costo congelado
// se informan aparte y no entran al cálculo; un producto con costo $0 avisa que su ganancia puede ser
// mayor a la real.
import { formatearCantidad, formatearClp, formatearPorcentaje } from '../utils/formato';
import { useReporte } from '../utils/useReporte';
import { etiquetaPeriodo } from './ReporteVentas';
import type { Periodo } from '../utils/periodo';
import type { ReporteGanancias } from '../types';
import '../styles/ventas.css';
import '../styles/reportes.css';

interface Props {
  periodo: Periodo;
  valido: boolean;
}

export function ReporteGananciasPeriodo({ periodo, valido }: Props) {
  const { datos, error, cargando } = useReporte<ReporteGanancias>(
    valido ? '/reportes/ganancias' : null,
    valido ? { desde: periodo.desde, hasta: periodo.hasta } : undefined
  );

  if (!valido) return null;
  if (error) return <p role="alert" className="alerta alerta--error">{error}</p>;
  if (!datos) return <p className="pagina-descripcion">Cargando las ganancias…</p>;

  const sinVentas = datos.productos.length === 0 && datos.sin_costo.cantidad === 0;

  return (
    <div className={cargando ? 'reporte reporte--cargando' : 'reporte'} aria-busy={cargando}>
      <div className="caja-periodo" aria-live="polite">
        <div className="caja-vendido">
          <span>Ganancia {etiquetaPeriodo(datos.desde, datos.hasta)}</span>
          <strong className={datos.ganancia < 0 ? 'ganancia--negativa' : undefined}>{formatearClp(datos.ganancia)}</strong>
          <span>Margen {formatearPorcentaje(datos.margen)}</span>
        </div>
        <p className="caja-aparte">
          Vendido con costo registrado {formatearClp(datos.vendido)}, costo {formatearClp(datos.costo)}.
        </p>
      </div>

      {datos.sin_costo.cantidad > 0 && (
        <p role="status" className="alerta alerta--aviso">
          {datos.sin_costo.cantidad === 1 ? '1 venta anterior no tiene' : `${datos.sin_costo.cantidad} ventas anteriores no tienen`}{' '}
          costo registrado ({formatearClp(datos.sin_costo.total)}): no entran a la ganancia ni al margen.
        </p>
      )}
      {datos.productos_con_costo_cero > 0 && (
        <p role="status" className="alerta alerta--aviso">
          {datos.productos_con_costo_cero === 1 ? '1 producto vendido tiene' : `${datos.productos_con_costo_cero} productos vendidos tienen`}{' '}
          costo $0: su ganancia puede ser mayor a la real. Revisa su costo en Inventario.
        </p>
      )}

      {sinVentas && (
        <div className="vacio vacio--compacto">
          <strong>No hubo ventas con costo registrado en este período</strong>
          <p>Las ganancias se calculan con las ventas confirmadas desde que el costo queda guardado en cada venta.</p>
        </div>
      )}

      {datos.productos.length > 0 && (
        <>
          <h3 className="pagina-subtitulo">Ganancia por producto</h3>
          <div className="tabla-contenedor">
            <table className="tabla tabla-reporte">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="numero">Cantidad</th>
                  <th className="numero">Vendido</th>
                  <th className="numero">Costo</th>
                  <th className="numero">Ganancia</th>
                  <th className="numero">Margen</th>
                </tr>
              </thead>
              <tbody>
                {datos.productos.map((producto) => (
                  <tr key={producto.producto_id}>
                    <td>
                      {producto.nombre}
                      {producto.costo_cero && <span className="chip chip--alerta chip--costo">Costo $0</span>}
                    </td>
                    <td className="numero">{formatearCantidad(producto.cantidad, producto.unidad_medida)}</td>
                    <td className="numero">{formatearClp(producto.vendido)}</td>
                    <td className="numero">{formatearClp(producto.costo)}</td>
                    <td className={`numero${producto.ganancia < 0 ? ' ganancia--negativa' : ''}`}>{formatearClp(producto.ganancia)}</td>
                    <td className="numero">{formatearPorcentaje(producto.margen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {datos.total_productos > datos.productos.length && (
            <p className="ayuda">
              Se muestran los {datos.productos.length} productos con más ganancia, de {datos.total_productos} vendidos.
            </p>
          )}
        </>
      )}
    </div>
  );
}
