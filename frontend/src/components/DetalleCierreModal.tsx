// Detalle de un cierre de caja (spec 005, RF-25, RF-26): todas las cifras del turno tal como se contaron
// al cerrar. Un cierre no se edita ni se borra; una anulación posterior no lo cambia.
import { Modal } from './Modal';
import {
  NOMBRE_METODO_ABONO, NOMBRE_METODO_PAGO, describirDiferencia, formatearClp, formatearFechaHora,
} from '../utils/formato';
import type { CierreCaja } from '../types';
import '../styles/reportes.css';

interface Props {
  cierre: CierreCaja;
  onCerrar: () => void;
}

export function DetalleCierreModal({ cierre, onCerrar }: Props) {
  return (
    <Modal titulo={`Cierre n.º ${cierre.id}`} idTitulo="titulo-detalle-cierre"
      subtitulo={`${cierre.usuario_nombre} · ${formatearFechaHora(cierre.cerrado_en)}`} onCerrar={onCerrar}>
      <div className={`resultado-cierre resultado-cierre--${cierre.estado}`} role="status">
        <strong>{describirDiferencia(cierre.diferencia)}</strong>
        <span>
          Esperado {formatearClp(cierre.efectivo_esperado)} · contado {formatearClp(cierre.efectivo_contado)}
        </span>
      </div>

      <dl className="detalle-datos">
        <div><dt>Persona</dt><dd>{cierre.usuario_nombre}</dd></div>
        <div><dt>Turno desde</dt><dd>{cierre.desde ? formatearFechaHora(cierre.desde) : 'Sin movimientos'}</dd></div>
        <div><dt>Cerrado</dt><dd>{formatearFechaHora(cierre.cerrado_en)}</dd></div>
        <div><dt>Fondo inicial</dt><dd>{formatearClp(cierre.fondo_inicial)}</dd></div>
      </dl>

      <div className="reporte-rejilla reporte-rejilla--modal">
        <section className="reporte-tarjeta">
          <h4 className="reporte-titulo">Ventas del turno ({cierre.cantidad_ventas})</h4>
          <dl className="cobrado-lista">
            <div><dt>{NOMBRE_METODO_PAGO.efectivo}</dt><dd>{formatearClp(cierre.ventas_efectivo)}</dd></div>
            <div><dt>{NOMBRE_METODO_PAGO.debito}</dt><dd>{formatearClp(cierre.ventas_debito)}</dd></div>
            <div><dt>{NOMBRE_METODO_PAGO.credito}</dt><dd>{formatearClp(cierre.ventas_credito)}</dd></div>
            <div><dt>{NOMBRE_METODO_PAGO.fiado} (no entra a caja)</dt><dd>{formatearClp(cierre.ventas_fiado)}</dd></div>
          </dl>
        </section>

        <section className="reporte-tarjeta">
          <h4 className="reporte-titulo">Abonos cobrados</h4>
          <dl className="cobrado-lista">
            <div><dt>{NOMBRE_METODO_ABONO.efectivo}</dt><dd>{formatearClp(cierre.abonos_efectivo)}</dd></div>
            <div><dt>{NOMBRE_METODO_ABONO.debito}</dt><dd>{formatearClp(cierre.abonos_debito)}</dd></div>
            <div><dt>{NOMBRE_METODO_ABONO.credito}</dt><dd>{formatearClp(cierre.abonos_credito)}</dd></div>
            <div><dt>{NOMBRE_METODO_ABONO.transferencia}</dt><dd>{formatearClp(cierre.abonos_transferencia)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="reporte-tarjeta cuenta-efectivo">
        <h4 className="reporte-titulo">Cómo se calculó el efectivo esperado</h4>
        <dl className="cobrado-lista">
          <div><dt>Fondo inicial</dt><dd>{formatearClp(cierre.fondo_inicial)}</dd></div>
          <div><dt>Ventas en efectivo</dt><dd>+ {formatearClp(cierre.ventas_efectivo)}</dd></div>
          <div><dt>Abonos en efectivo</dt><dd>+ {formatearClp(cierre.abonos_efectivo)}</dd></div>
          <div>
            <dt>Efectivo devuelto por anulaciones</dt>
            <dd>− {formatearClp(cierre.efectivo_devuelto)}</dd>
          </div>
          <div className="cobrado-total"><dt>Efectivo esperado</dt><dd>{formatearClp(cierre.efectivo_esperado)}</dd></div>
          <div><dt>Efectivo contado</dt><dd>{formatearClp(cierre.efectivo_contado)}</dd></div>
        </dl>
      </section>

      {cierre.observacion && (
        <p className="ayuda"><strong>Observación:</strong> {cierre.observacion}</p>
      )}

      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cerrar</button>
      </div>
    </Modal>
  );
}
