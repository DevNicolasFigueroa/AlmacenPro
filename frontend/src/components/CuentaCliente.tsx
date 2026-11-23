// Cuenta de un cliente (spec 004, RF-7): contacto, saldo con su estado, compras y movimientos de
// fiado, de lo más reciente a lo más antiguo. La ven el cajero y el administrador; al abrir una
// compra se ve su detalle sin costos. Cada abono muestra su método y, si se anuló, cuándo y por qué.
import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import { AbonoModal } from './AbonoModal';
import { AnularAbonoModal } from './AnularAbonoModal';
import { DetalleVentaModal } from './DetalleVentaModal';
import { EstadoSaldo } from './EstadoSaldo';
import { EtiquetaEstadoVenta } from './EtiquetaEstadoVenta';
import {
  NOMBRE_METODO_ABONO, NOMBRE_METODO_PAGO, NOMBRE_MOVIMIENTO_FIADO, formatearClp, formatearFechaHora,
} from '../utils/formato';
import type { CuentaCliente as Cuenta, EstadoCuenta, MovimientoFiado } from '../types';
import '../styles/ventas.css';
import '../styles/clientes.css';

interface Props {
  clienteId: number;
  // Se llama cuando el saldo cambia (abono o anulación), para que la pantalla de origen lo actualice.
  onSaldoCambiado?: (saldo: number, estado: EstadoCuenta) => void;
}

// Cargo y anulación de abono suben la deuda (+); abono y anulación de venta la bajan (−).
const SUMA_A_LA_DEUDA = new Set<MovimientoFiado['tipo']>(['cargo', 'anulacion_abono']);

function DetalleMovimiento({ movimiento }: { movimiento: MovimientoFiado }) {
  return (
    <>
      {movimiento.tipo === 'abono' && movimiento.metodo_pago && (
        <span className="movimiento-metodo">{NOMBRE_METODO_ABONO[movimiento.metodo_pago]}</span>
      )}
      {movimiento.observacion && <span>{movimiento.observacion}</span>}
      {movimiento.anulado && (
        <span className="movimiento-anulado">
          Anulado por {movimiento.anulado_por_nombre} el {formatearFechaHora(movimiento.anulado_en)}:{' '}
          {movimiento.motivo_anulacion}
        </span>
      )}
      <span className="movimiento-quien">Lo registró {movimiento.usuario_nombre}</span>
    </>
  );
}

export function CuentaCliente({ clienteId, onSaldoCambiado }: Props) {
  const { usuario } = useAutenticacion();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [compraAbierta, setCompraAbierta] = useState<number | null>(null);
  const [abonando, setAbonando] = useState(false);
  const [anulando, setAnulando] = useState<MovimientoFiado | null>(null);

  // RF-19: solo el administrador anula abonos; el servidor también lo exige.
  const esAdministrador = usuario?.rol === 'administrador';

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get<Cuenta>(`/clientes/${clienteId}/cuenta`);
      setCuenta(data);
      return data;
    } catch (err) {
      setError(mensajeError(err));
      return null;
    }
  }, [clienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tras un abono o una anulación se vuelve a leer la cuenta y se avisa a la pantalla de origen.
  async function alCambiarSaldo(texto: string) {
    setMensaje(texto);
    const actualizada = await cargar();
    if (actualizada) onSaldoCambiado?.(actualizada.cliente.saldo, actualizada.cliente.estado);
  }

  if (error && !cuenta) return <p role="alert" className="alerta alerta--error">{error}</p>;
  if (!cuenta) return <p className="pagina-descripcion">Cargando la cuenta…</p>;

  const { cliente } = cuenta;
  const contacto = [cliente.telefono, cliente.email, cliente.direccion].filter(Boolean);
  const nombreCliente = cliente.nombre ?? cliente.rut_formateado;

  return (
    <>
      <div className="cuenta-cabecera">
        <div>
          <h3 className="cuenta-nombre">{cliente.nombre ?? 'Sin nombre'}</h3>
          <p className="cuenta-rut">{cliente.rut_formateado}</p>
          {contacto.length > 0 && <p className="cuenta-contacto">{contacto.join(' · ')}</p>}
        </div>
        <div className="cuenta-saldo">
          <span>{cliente.estado === 'a_favor' ? 'Saldo a favor' : 'Saldo'}</span>
          <strong className={cliente.estado === 'deuda' ? 'saldo--deuda' : undefined}>
            {formatearClp(Math.abs(cliente.saldo))}
          </strong>
          <EstadoSaldo estado={cliente.estado} saldo={cliente.saldo} />
        </div>
      </div>

      <div className="cuenta-acciones">
        <button type="button" className="boton" onClick={() => { setMensaje(''); setAbonando(true); }}>
          Registrar abono
        </button>
      </div>

      {mensaje && <p role="status" className="alerta alerta--ok">{mensaje}</p>}
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      <h3 className="pagina-subtitulo">Compras</h3>
      {cuenta.compras.length === 0 ? (
        <p className="pagina-descripcion">Todavía no tiene compras asociadas a su RUT.</p>
      ) : (
        <div className="tabla-contenedor tabla-contenedor--libre">
          <table className="tabla tabla-historial">
            <thead>
              <tr>
                <th>Venta</th>
                <th>Fecha y hora</th>
                <th>Pago</th>
                <th className="numero">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuenta.compras.map((compra) => (
                <tr key={compra.id}
                  className={compra.estado === 'anulada' ? 'fila--abrible fila--apagada' : 'fila--abrible'}
                  onClick={() => setCompraAbierta(compra.id)}>
                  <td className="celda-venta">
                    <button type="button" className="enlace-fila"
                      aria-label={`Ver el detalle de la venta ${compra.id}`}
                      onClick={(e) => { e.stopPropagation(); setCompraAbierta(compra.id); }}>
                      n.º {compra.id}
                    </button>
                  </td>
                  <td data-etiqueta="Fecha">{formatearFechaHora(compra.fecha)}</td>
                  <td data-etiqueta="Pago">{NOMBRE_METODO_PAGO[compra.metodo_pago]}</td>
                  <td className="numero" data-etiqueta="Total">{formatearClp(compra.total)}</td>
                  <td data-etiqueta="Estado"><EtiquetaEstadoVenta estado={compra.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="pagina-subtitulo cuenta-seccion">Fiados y abonos</h3>
      {cuenta.movimientos.length === 0 ? (
        <p className="pagina-descripcion">No tiene movimientos de fiado.</p>
      ) : (
        <div className="tabla-contenedor tabla-contenedor--libre">
          <table className="tabla tabla-historial">
            <thead>
              <tr>
                <th>Movimiento</th>
                <th>Fecha y hora</th>
                <th>Detalle</th>
                <th className="numero">Monto</th>
                {esAdministrador && <th><span className="visualmente-oculto">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {cuenta.movimientos.map((movimiento) => (
                <tr key={movimiento.id} className={movimiento.anulado ? 'fila--apagada' : undefined}>
                  <td className="celda-venta">
                    <strong>{NOMBRE_MOVIMIENTO_FIADO[movimiento.tipo]}</strong>
                    {movimiento.anulado && <span className="chip chip--peligro">Anulado</span>}
                  </td>
                  <td data-etiqueta="Fecha">{formatearFechaHora(movimiento.fecha)}</td>
                  <td data-etiqueta="Detalle" className="celda-movimiento">
                    <DetalleMovimiento movimiento={movimiento} />
                  </td>
                  <td data-etiqueta="Monto"
                    className={`numero ${SUMA_A_LA_DEUDA.has(movimiento.tipo) ? 'cantidad--menos' : 'cantidad--mas'}`}>
                    {SUMA_A_LA_DEUDA.has(movimiento.tipo) ? '+' : '−'}{formatearClp(movimiento.monto)}
                  </td>
                  {esAdministrador && (
                    <td className="celda-acciones-movimiento">
                      {movimiento.tipo === 'abono' && !movimiento.anulado && (
                        <button type="button" className="boton boton--pequeno boton--secundario"
                          aria-label={`Anular el abono de ${formatearClp(movimiento.monto)}`}
                          onClick={() => { setMensaje(''); setAnulando(movimiento); }}>
                          Anular
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abonando && (
        <AbonoModal clienteId={clienteId} nombreCliente={nombreCliente} saldo={cliente.saldo}
          onCerrar={() => setAbonando(false)}
          onRegistrado={() => { setAbonando(false); alCambiarSaldo('Abono registrado'); }} />
      )}

      {anulando && (
        <AnularAbonoModal clienteId={clienteId} nombreCliente={nombreCliente} abono={anulando}
          onCerrar={() => setAnulando(null)}
          onAnulado={(texto) => { setAnulando(null); alCambiarSaldo(texto); }} />
      )}

      {compraAbierta !== null && (
        <DetalleVentaModal ventaId={compraAbierta}
          rutaDetalle={`/clientes/${clienteId}/compras/${compraAbierta}`}
          puedeAnular={false} onCerrar={() => setCompraAbierta(null)} />
      )}
    </>
  );
}
