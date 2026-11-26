// Resumen tras confirmar la venta (spec 003, RF-31, RF-32): número, total, método, vuelto,
// cliente y el stock actualizado de lo vendido con las marcas de stock bajo o agotado.
import { formatearCantidad, formatearClp } from '../utils/formato';
import type { ClienteVenta, EstadoStock, RespuestaConfirmacion } from '../types';
import '../styles/ventas.css';

interface Props {
  resumen: RespuestaConfirmacion;
  cliente: ClienteVenta | null;
  onNuevaVenta: () => void;
}

const NOMBRE_METODO = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado' } as const;

function EtiquetaEstado({ estado }: { estado: EstadoStock }) {
  if (estado === 'agotado') return <span className="chip chip--peligro">Agotado</span>;
  if (estado === 'bajo') return <span className="chip chip--alerta">Stock bajo</span>;
  return null;
}

export function ResumenVentaConfirmada({ resumen, cliente, onNuevaVenta }: Props) {
  const { venta } = resumen;

  return (
    <section className="venta-lista" aria-label="Venta confirmada">
      <div className="venta-lista-cabecera">
        <h3>Venta n.º {venta.id} confirmada</h3>
        <p>{NOMBRE_METODO[venta.metodo_pago]}</p>
      </div>

      <div className="venta-lista-total">
        <span>Total cobrado</span>
        <strong>{formatearClp(venta.total)}</strong>
      </div>

      {resumen.vuelto !== null && (
        <p className="venta-lista-vuelto" role="status">
          Entrega de vuelto <strong>{formatearClp(resumen.vuelto)}</strong>
        </p>
      )}

      {cliente && resumen.cliente && (
        <p className="venta-lista-cliente">
          Quedó en la cuenta de {cliente.nombre ?? cliente.rut_formateado}.{' '}
          {resumen.cliente.estado === 'deuda' && <>Ahora debe <strong>{formatearClp(resumen.cliente.saldo)}</strong>.</>}
          {resumen.cliente.estado === 'a_favor' && <>Tiene <strong>{formatearClp(-resumen.cliente.saldo)}</strong> a su favor.</>}
          {resumen.cliente.estado === 'al_dia' && 'No tiene deuda.'}
        </p>
      )}

      <h4 className="venta-lista-subtitulo">Stock después de la venta</h4>
      <ul className="venta-lista-stock">
        {resumen.productos.map((producto) => (
          <li key={producto.id}>
            <span className="venta-lista-producto">{producto.nombre}</span>
            <span className="venta-lista-cifra">
              {formatearCantidad(producto.stock, producto.unidad_medida)}
            </span>
            <EtiquetaEstado estado={producto.estado_stock} />
          </li>
        ))}
      </ul>

      <button type="button" className="boton boton--grande" autoFocus onClick={onNuevaVenta}>
        Nueva venta
      </button>
    </section>
  );
}
