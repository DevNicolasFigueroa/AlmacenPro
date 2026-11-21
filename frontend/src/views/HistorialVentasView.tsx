// Historial de ventas (spec 003, RF-35–39, RF-42–48): solo administrador.
// Muestra lo que pasó en el mesón en un período, con las ventas anuladas y las canceladas para
// tener seguimiento. Solo las completadas suman al total vendido.
import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import { DetalleVentaModal } from '../components/DetalleVentaModal';
import { EtiquetaEstadoVenta } from '../components/EtiquetaEstadoVenta';
import {
  NOMBRE_METODO_PAGO, diaLocal, formatearClp, formatearFechaHora,
} from '../utils/formato';
import { formatearRut } from '../utils/rut';
import type { RespuestaHistorial } from '../types';
import '../styles/ventas.css';

type FiltroEstado = '' | 'completada' | 'anulada' | 'canceladas';

function desplazarDias(base: Date, dias: number) {
  const fecha = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  return diaLocal(fecha);
}

// 'AAAA-MM-DD' -> 'DD-MM-AAAA' para mostrar.
function aDiaMes(texto: string) {
  return texto.split('-').reverse().join('-');
}

export function VistaHistorialVentas() {
  const hoy = new Date();
  const [desde, setDesde] = useState(diaLocal(hoy));
  const [hasta, setHasta] = useState(diaLocal(hoy));
  const [estado, setEstado] = useState<FiltroEstado>('');
  const [datos, setDatos] = useState<RespuestaHistorial | null>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ventaAbierta, setVentaAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError('');
    if (desde && hasta && desde > hasta) {
      setError('La fecha "desde" no puede ser posterior a la fecha "hasta"');
      return;
    }
    setCargando(true);
    try {
      const { data } = await api.get<RespuestaHistorial>('/ventas', {
        params: { desde: desde || undefined, hasta: hasta || undefined, estado: estado || undefined },
      });
      setDatos(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, estado]);

  useEffect(() => { cargar(); }, [cargar]);

  const rangos = [
    { texto: 'Hoy', desde: diaLocal(hoy), hasta: diaLocal(hoy) },
    { texto: 'Ayer', desde: desplazarDias(hoy, -1), hasta: desplazarDias(hoy, -1) },
    { texto: 'Últimos 7 días', desde: desplazarDias(hoy, -6), hasta: diaLocal(hoy) },
    {
      texto: 'Este mes',
      desde: diaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
      hasta: diaLocal(hoy),
    },
  ];

  const resumen = datos?.resumen;
  const cuentas: { clave: FiltroEstado; texto: string; cantidad: number }[] = resumen ? [
    {
      clave: '',
      texto: 'Todas',
      cantidad: resumen.completadas.cantidad + resumen.anuladas.cantidad + resumen.canceladas.cantidad,
    },
    { clave: 'completada', texto: 'Completadas', cantidad: resumen.completadas.cantidad },
    { clave: 'anulada', texto: 'Anuladas', cantidad: resumen.anuladas.cantidad },
    { clave: 'canceladas', texto: 'Canceladas', cantidad: resumen.canceladas.cantidad },
  ] : [];

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Historial de ventas</h2>
          <p className="pagina-descripcion">
            Qué se vendió, quién lo vendió y qué pasó con cada venta, incluidas las anuladas y las canceladas.
          </p>
        </div>
      </header>

      <div className="segmentos" role="group" aria-label="Rango de fechas rápido">
        {rangos.map((rango) => (
          <button key={rango.texto} type="button" className="segmento"
            aria-pressed={desde === rango.desde && hasta === rango.hasta}
            onClick={() => { setDesde(rango.desde); setHasta(rango.hasta); }}>
            {rango.texto}
          </button>
        ))}
      </div>

      <div className="campo-fila">
        <label className="campo">
          Desde
          <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="campo">
          Hasta
          <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      {mensaje && <p role="status" className="alerta alerta--ok">{mensaje}</p>}
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {resumen && datos && (
        <div className="caja-periodo" aria-live="polite">
          <div className="caja-vendido">
            <span>
              Vendido {datos.desde === datos.hasta
                ? `el ${aDiaMes(datos.desde)}`
                : `entre el ${aDiaMes(datos.desde)} y el ${aDiaMes(datos.hasta)}`}
            </span>
            <strong>{formatearClp(resumen.completadas.total)}</strong>
            <span>
              {resumen.completadas.cantidad} {resumen.completadas.cantidad === 1 ? 'venta completada' : 'ventas completadas'}
            </span>
          </div>
          <p className="caja-aparte">
            {resumen.anuladas.cantidad} {resumen.anuladas.cantidad === 1 ? 'anulada' : 'anuladas'} y{' '}
            {resumen.canceladas.cantidad} {resumen.canceladas.cantidad === 1 ? 'cancelada' : 'canceladas'}{' '}
            no se suman al total.
          </p>
        </div>
      )}

      {resumen && (
        <div className="segmentos" role="group" aria-label="Filtrar por estado de la venta">
          {cuentas.map(({ clave, texto, cantidad }) => (
            <button key={clave || 'todas'} type="button" className="segmento"
              aria-pressed={estado === clave} onClick={() => setEstado(clave)}>
              {texto}
              <span className={cantidad > 0 ? 'segmento-cuenta tiene' : 'segmento-cuenta'}>{cantidad}</span>
            </button>
          ))}
        </div>
      )}

      {cargando && !datos && <p className="pagina-descripcion">Cargando historial…</p>}

      {datos && datos.ventas.length === 0 && !error && (
        <div className="vacio">
          <strong>No hay ventas en este período</strong>
          <p>Prueba con otras fechas o quita el filtro de estado. Las ventas del día aparecen aquí apenas se cierran.</p>
        </div>
      )}

      {datos && datos.ventas.length > 0 && (
        <div className="tabla-contenedor tabla-contenedor--libre">
          <table className="tabla tabla-historial">
            <thead>
              <tr>
                <th>Venta</th>
                <th>Fecha y hora</th>
                <th>Cajero</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th className="numero">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.ventas.map((venta) => (
                <tr key={venta.id}
                  className={venta.estado === 'completada' ? 'fila--abrible' : 'fila--abrible fila--apagada'}
                  onClick={() => setVentaAbierta(venta.id)}>
                  <td className="celda-venta">
                    <button type="button" className="enlace-fila"
                      aria-label={`Ver el detalle de la venta ${venta.id}`}
                      onClick={(e) => { e.stopPropagation(); setVentaAbierta(venta.id); }}>
                      n.º {venta.id}
                    </button>
                  </td>
                  <td data-etiqueta="Fecha">{formatearFechaHora(venta.fecha)}</td>
                  <td data-etiqueta="Cajero">{venta.cajero_nombre}</td>
                  <td data-etiqueta="Cliente">{venta.cliente_nombre ?? (venta.cliente_rut ? formatearRut(venta.cliente_rut) : 'Sin cliente')}</td>
                  <td data-etiqueta="Pago">{venta.metodo_pago ? NOMBRE_METODO_PAGO[venta.metodo_pago] : 'Sin cobro'}</td>
                  <td className="numero" data-etiqueta="Total">{formatearClp(venta.total)}</td>
                  <td data-etiqueta="Estado"><EtiquetaEstadoVenta estado={venta.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ventaAbierta !== null && (
        <DetalleVentaModal ventaId={ventaAbierta} onCerrar={() => setVentaAbierta(null)}
          onAnulada={(texto) => { setMensaje(texto); cargar(); }} />
      )}
    </section>
  );
}
