// Cuenta del cliente (spec 003, RF-23): se busca por RUT, su único identificador, y se ve su saldo,
// sus compras (completadas y anuladas) y sus movimientos de fiado. Solo administrador.
// El listado de deudores y los abonos pertenecen a la spec de clientes y fiado.
import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import { DetalleVentaModal } from '../components/DetalleVentaModal';
import { EtiquetaEstadoVenta } from '../components/EtiquetaEstadoVenta';
import {
  NOMBRE_METODO_PAGO, formatearClp, formatearFechaHora,
} from '../utils/formato';
import { esRutValido, formatearAlEscribir, normalizarRut } from '../utils/rut';
import type { ClienteVenta, CuentaCliente } from '../types';
import '../styles/ventas.css';

const NOMBRE_MOVIMIENTO = { cargo: 'Cargo por venta', abono: 'Abono', anulacion: 'Anulación de venta' } as const;

function EstadoDeCuenta({ cliente }: { cliente: ClienteVenta }) {
  if (cliente.estado === 'deuda') {
    return <span className="chip chip--alerta">Debe {formatearClp(cliente.saldo)}</span>;
  }
  if (cliente.estado === 'a_favor') {
    return <span className="chip">Saldo a favor {formatearClp(-cliente.saldo)}</span>;
  }
  return <span className="chip chip--apagado">Sin deuda</span>;
}

export function VistaClientes() {
  const [texto, setTexto] = useState('');
  const [cuenta, setCuenta] = useState<CuentaCliente | null>(null);
  const [error, setError] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [ventaAbierta, setVentaAbierta] = useState<number | null>(null);

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    setError('');
    if (!esRutValido(texto)) {
      setCuenta(null);
      setError('El RUT no es válido: revisa que esté bien escrito, con su dígito verificador');
      return;
    }

    setBuscando(true);
    try {
      const { data: cliente } = await api.get<ClienteVenta>(`/clientes/rut/${normalizarRut(texto)}`);
      const { data } = await api.get<CuentaCliente>(`/clientes/${cliente.id}/cuenta`);
      setCuenta(data);
    } catch (err) {
      setCuenta(null);
      setError(isAxiosError(err) && err.response?.status === 404
        ? 'No hay un cliente registrado con ese RUT. Se registra al venderle por primera vez.'
        : mensajeError(err));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Clientes y fiado</h2>
          <p className="pagina-descripcion">
            Busca a un cliente por su RUT para ver qué ha comprado, qué se le ha fiado y cuánto debe.
          </p>
        </div>
      </header>

      <form className="hoja buscar-cliente" onSubmit={buscar}>
        <label className="campo">
          RUT del cliente
          <div className="campo-con-boton">
            <input value={texto} placeholder="12.345.678-5" autoComplete="off" autoFocus
              onChange={(e) => { setTexto(formatearAlEscribir(e.target.value)); setError(''); }} />
            <button type="submit" className="boton" disabled={buscando || texto.trim() === ''}>
              Ver cuenta
            </button>
          </div>
        </label>
      </form>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {!cuenta && !error && (
        <div className="vacio">
          <strong>Escribe un RUT para ver una cuenta</strong>
          <p>
            Aquí verás las compras y los fiados de cada cliente. El listado de deudores y el registro de
            abonos estarán disponibles más adelante.
          </p>
        </div>
      )}

      {cuenta && (
        <>
          <div className="cuenta-cabecera">
            <div>
              <h3 className="cuenta-nombre">{cuenta.cliente.nombre ?? cuenta.cliente.rut_formateado}</h3>
              {cuenta.cliente.nombre && <p className="cuenta-rut">{cuenta.cliente.rut_formateado}</p>}
            </div>
            <div className="cuenta-saldo">
              <span>Saldo</span>
              <strong>{formatearClp(Math.abs(cuenta.cliente.saldo))}</strong>
              <EstadoDeCuenta cliente={cuenta.cliente} />
            </div>
          </div>

          <h3 className="pagina-subtitulo">Compras</h3>
          {cuenta.compras.length === 0 ? (
            <p className="pagina-descripcion">Todavía no tiene compras asociadas a su RUT.</p>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
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
                    <tr key={compra.id} className={compra.estado === 'anulada' ? 'fila--abrible fila--apagada' : 'fila--abrible'}
                      onClick={() => setVentaAbierta(compra.id)}>
                      <td>
                        <button type="button" className="enlace-fila"
                          aria-label={`Ver el detalle de la venta ${compra.id}`}
                          onClick={(e) => { e.stopPropagation(); setVentaAbierta(compra.id); }}>
                          n.º {compra.id}
                        </button>
                      </td>
                      <td>{formatearFechaHora(compra.fecha)}</td>
                      <td>{NOMBRE_METODO_PAGO[compra.metodo_pago]}</td>
                      <td className="numero">{formatearClp(compra.total)}</td>
                      <td><EtiquetaEstadoVenta estado={compra.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="pagina-subtitulo cuenta-seccion">Fiados</h3>
          {cuenta.movimientos.length === 0 ? (
            <p className="pagina-descripcion">No tiene movimientos de fiado.</p>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Movimiento</th>
                    <th>Detalle</th>
                    <th className="numero">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {cuenta.movimientos.map((movimiento) => (
                    <tr key={movimiento.id}>
                      <td>{formatearFechaHora(movimiento.fecha)}</td>
                      <td>{NOMBRE_MOVIMIENTO[movimiento.tipo]}</td>
                      <td className="historial-nota">{movimiento.observacion ?? ''}</td>
                      <td className={`numero ${movimiento.tipo === 'cargo' ? 'cantidad--menos' : 'cantidad--mas'}`}>
                        {movimiento.tipo === 'cargo' ? '+' : '−'}{formatearClp(movimiento.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {ventaAbierta !== null && (
        <DetalleVentaModal ventaId={ventaAbierta} onCerrar={() => setVentaAbierta(null)} />
      )}
    </section>
  );
}
