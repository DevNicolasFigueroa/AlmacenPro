// Ventas por período (spec 005, RF-4 a RF-9): lo vendido, la cantidad y el promedio, el desglose por
// método de pago, por cajero y por día, lo anulado y cancelado aparte y la diferencia entre lo vendido
// y lo cobrado (lo vendido al fiado todavía no entró a caja). Solo las completadas suman.
import { NOMBRE_METODO_ABONO, NOMBRE_METODO_PAGO, formatearClp, formatearDia, formatearPorcentaje } from '../utils/formato';
import { useReporte } from '../utils/useReporte';
import type { Periodo } from '../utils/periodo';
import type { MetodoPago, ReporteVentas } from '../types';
import '../styles/ventas.css';
import '../styles/reportes.css';

interface Props {
  periodo: Periodo;
  valido: boolean;
}

const METODOS: MetodoPago[] = ['efectivo', 'debito', 'credito', 'fiado'];

export function etiquetaPeriodo(desde: string, hasta: string) {
  return desde === hasta ? `el ${formatearDia(desde)}` : `entre el ${formatearDia(desde)} y el ${formatearDia(hasta)}`;
}

function plural(cantidad: number, singular: string, pluralTexto: string) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

export function ReporteVentasPeriodo({ periodo, valido }: Props) {
  const { datos, error, cargando } = useReporte<ReporteVentas>(
    valido ? '/reportes/ventas' : null,
    valido ? { desde: periodo.desde, hasta: periodo.hasta } : undefined
  );

  if (!valido) return null;
  if (error) return <p role="alert" className="alerta alerta--error">{error}</p>;
  if (!datos) return <p className="pagina-descripcion">Cargando las ventas…</p>;

  const sinMovimiento = datos.cantidad === 0 && datos.anuladas.cantidad === 0 && datos.canceladas.cantidad === 0;
  const { cobrado } = datos;

  return (
    <div className={cargando ? 'reporte reporte--cargando' : 'reporte'} aria-busy={cargando}>
      <div className="caja-periodo" aria-live="polite">
        <div className="caja-vendido">
          <span>Vendido {etiquetaPeriodo(datos.desde, datos.hasta)}</span>
          <strong>{formatearClp(datos.vendido)}</strong>
          <span>
            {plural(datos.cantidad, 'venta completada', 'ventas completadas')}
            {datos.cantidad > 0 && <> · promedio {formatearClp(datos.promedio)}</>}
          </span>
        </div>
        <p className="caja-aparte">
          {plural(datos.anuladas.cantidad, 'anulada', 'anuladas')}
          {datos.anuladas.cantidad > 0 && <> ({formatearClp(datos.anuladas.total)})</>} y{' '}
          {plural(datos.canceladas.cantidad, 'cancelada', 'canceladas')} no se suman al total.
        </p>
      </div>

      {sinMovimiento && (
        <div className="vacio vacio--compacto">
          <strong>No hubo ventas en este período</strong>
          <p>Prueba con otras fechas, por ejemplo Esta semana o Este mes.</p>
        </div>
      )}

      {!sinMovimiento && (
        <>
          <div className="reporte-rejilla">
            <section className="reporte-tarjeta">
              <h3 className="reporte-titulo">Por método de pago</h3>
              <table className="tabla tabla-reporte">
                <thead>
                  <tr><th>Método</th><th className="numero">Ventas</th><th className="numero">Total</th><th className="numero">Parte</th></tr>
                </thead>
                <tbody>
                  {METODOS.map((metodo) => {
                    const fila = datos.por_metodo[metodo];
                    return (
                      <tr key={metodo}>
                        <td>{NOMBRE_METODO_PAGO[metodo]}</td>
                        <td className="numero">{fila.cantidad}</td>
                        <td className="numero">{formatearClp(fila.total)}</td>
                        <td className="numero">{datos.vendido > 0 ? formatearPorcentaje((fila.total / datos.vendido) * 100) : '0 %'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><th>Total</th><th className="numero">{datos.cantidad}</th><th className="numero">{formatearClp(datos.vendido)}</th><th /></tr>
                </tfoot>
              </table>
            </section>

            <section className="reporte-tarjeta">
              <h3 className="reporte-titulo">Por cajero</h3>
              {datos.por_cajero.length === 0 ? (
                <p className="pagina-descripcion">Nadie vendió en este período.</p>
              ) : (
                <table className="tabla tabla-reporte">
                  <thead><tr><th>Cajero</th><th className="numero">Ventas</th><th className="numero">Total</th></tr></thead>
                  <tbody>
                    {datos.por_cajero.map((fila) => (
                      <tr key={fila.usuario_id}>
                        <td>{fila.nombre}</td>
                        <td className="numero">{fila.cantidad}</td>
                        <td className="numero">{formatearClp(fila.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="reporte-tarjeta">
              <h3 className="reporte-titulo">Por día</h3>
              {datos.por_dia.length === 0 ? (
                <p className="pagina-descripcion">No hubo ventas completadas.</p>
              ) : (
                <table className="tabla tabla-reporte">
                  <thead><tr><th>Día</th><th className="numero">Ventas</th><th className="numero">Total</th></tr></thead>
                  <tbody>
                    {datos.por_dia.map((fila) => (
                      <tr key={fila.dia}>
                        <td>{formatearDia(fila.dia)}</td>
                        <td className="numero">{fila.cantidad}</td>
                        <td className="numero">{formatearClp(fila.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <h3 className="pagina-subtitulo">Vendido y cobrado</h3>
          <div className="reporte-rejilla">
            <section className="reporte-tarjeta reporte-tarjeta--fiado">
              <h4 className="reporte-titulo">Vendido al fiado</h4>
              <p className="reporte-cifra">{formatearClp(cobrado.vendido_al_fiado)}</p>
              <p className="ayuda">Todavía no entró a caja: se cobra con abonos.</p>
            </section>

            <section className="reporte-tarjeta reporte-tarjeta--cobrado">
              <h4 className="reporte-titulo">Cobrado</h4>
              <p className="reporte-cifra">{formatearClp(cobrado.total)}</p>
              <dl className="cobrado-lista">
                <div><dt>Ventas en efectivo</dt><dd>{formatearClp(cobrado.ventas.efectivo)}</dd></div>
                <div><dt>Ventas con débito</dt><dd>{formatearClp(cobrado.ventas.debito)}</dd></div>
                <div><dt>Ventas con crédito</dt><dd>{formatearClp(cobrado.ventas.credito)}</dd></div>
                {(['efectivo', 'debito', 'credito', 'transferencia'] as const).map((metodo) => (
                  <div key={metodo}>
                    <dt>Abonos ({NOMBRE_METODO_ABONO[metodo].toLowerCase()})</dt>
                    <dd>{formatearClp(cobrado.abonos[metodo])}</dd>
                  </div>
                ))}
                {cobrado.abonos.sin_metodo !== undefined && (
                  <div><dt>Abonos antiguos (sin método)</dt><dd>{formatearClp(cobrado.abonos.sin_metodo)}</dd></div>
                )}
              </dl>
              <p className="ayuda">Los abonos anulados no cuentan como cobrados.</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
