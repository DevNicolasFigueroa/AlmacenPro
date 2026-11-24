// Cierres de caja del administrador (spec 005, RF-25, RF-27): los turnos que todavía no se cierran y la lista
// de cierres de todas las personas, por período y por persona, con los faltantes y sobrantes a la vista. Un
// clic abre el detalle de cada cierre.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { DetalleCierreModal } from './DetalleCierreModal';
import {
  NOMBRE_ESTADO_CIERRE, describirDiferencia, formatearClp, formatearFechaHora,
} from '../utils/formato';
import { useReporte } from '../utils/useReporte';
import type { Periodo } from '../utils/periodo';
import type { CierreCaja, RespuestaListaCierres, TurnoSinCerrar } from '../types';
import '../styles/ventas.css';
import '../styles/reportes.css';

interface Props {
  periodo: Periodo;
  valido: boolean;
}

interface PersonaListada {
  id: number;
  nombre: string;
}

function EtiquetaDiferencia({ cierre }: { cierre: CierreCaja }) {
  const clase = cierre.estado === 'falta' ? 'chip chip--peligro' : cierre.estado === 'sobra' ? 'chip chip--alerta' : 'chip';
  return <span className={clase} title={describirDiferencia(cierre.diferencia)}>{describirDiferencia(cierre.diferencia)}</span>;
}

export function ListaCierres({ periodo, valido }: Props) {
  const [personas, setPersonas] = useState<PersonaListada[]>([]);
  const [persona, setPersona] = useState('');
  const [abierto, setAbierto] = useState<CierreCaja | null>(null);

  useEffect(() => {
    api.get<PersonaListada[]>('/auth/usuarios')
      .then(({ data }) => setPersonas(data.map(({ id, nombre }) => ({ id, nombre }))))
      .catch(() => setPersonas([])); // el filtro por persona es una ayuda: sin él la lista igual se ve
  }, []);

  const sinCerrar = useReporte<{ turnos: TurnoSinCerrar[] }>('/cierres-caja/sin-cerrar');
  const cierres = useReporte<RespuestaListaCierres>(
    valido ? '/cierres-caja' : null,
    valido ? { desde: periodo.desde, hasta: periodo.hasta, usuario_id: persona || undefined } : undefined
  );

  const turnos = sinCerrar.datos?.turnos ?? [];
  const lista = cierres.datos?.cierres ?? [];
  const conDiferencia = lista.filter((cierre) => cierre.diferencia !== 0).length;

  return (
    <div className="reporte">
      <section className="reporte-tarjeta reporte-tarjeta--ancha">
        <h3 className="reporte-titulo">Turnos sin cerrar</h3>
        {sinCerrar.error && <p role="alert" className="alerta alerta--error">{sinCerrar.error}</p>}
        {!sinCerrar.error && !sinCerrar.datos && <p className="pagina-descripcion">Cargando…</p>}
        {sinCerrar.datos && turnos.length === 0 && (
          <p className="pagina-descripcion">Todos los turnos con movimientos están cerrados.</p>
        )}
        {turnos.length > 0 && (
          <table className="tabla tabla-reporte">
            <thead>
              <tr>
                <th>Persona</th><th>Desde</th><th className="numero">Ventas</th><th className="numero">Efectivo cobrado</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((turno) => (
                <tr key={turno.usuario_id}>
                  <td>
                    {turno.nombre}
                    {!turno.activo && <span className="chip chip--apagado chip--costo">Cuenta desactivada</span>}
                  </td>
                  <td>{turno.desde ? formatearFechaHora(turno.desde) : '—'}</td>
                  <td className="numero">{turno.cantidad_ventas}</td>
                  <td className="numero">{formatearClp(turno.efectivo_cobrado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="acciones acciones--cierre">
        <Link to="/cierre-caja" className="boton">Cerrar mi turno</Link>
      </div>

      <div className="barra-filtro">
        <h3 className="pagina-subtitulo">Cierres de caja</h3>
        <label className="campo campo--chico">
          Persona
          <select value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todas</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      </div>

      {!valido && <p className="pagina-descripcion">Corrige el período para ver los cierres.</p>}
      {valido && cierres.error && <p role="alert" className="alerta alerta--error">{cierres.error}</p>}
      {valido && !cierres.error && !cierres.datos && <p className="pagina-descripcion">Cargando los cierres…</p>}
      {valido && cierres.datos && lista.length === 0 && (
        <div className="vacio vacio--compacto">
          <strong>No hay cierres de caja en este período</strong>
          <p>Prueba con otras fechas o con otra persona.</p>
        </div>
      )}

      {lista.length > 0 && (
        <>
          <p className="ayuda">
            {lista.length} {lista.length === 1 ? 'cierre' : 'cierres'}
            {conDiferencia > 0 ? `, ${conDiferencia} con diferencia.` : ', todos cuadran.'}
          </p>
          <div className="tabla-contenedor tabla-contenedor--libre">
            <table className="tabla tabla-historial tabla-cierres">
              <thead>
                <tr>
                  <th>Cierre</th><th>Persona</th>
                  <th className="numero">Esperado</th><th className="numero">Contado</th><th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((cierre) => (
                  <tr key={cierre.id}
                    className={cierre.diferencia !== 0 ? `fila--abrible fila--${cierre.estado}` : 'fila--abrible'}
                    onClick={() => setAbierto(cierre)}>
                    <td className="celda-venta">
                      <button type="button" className="enlace-fila"
                        aria-label={`Ver el detalle del cierre ${cierre.id}`}
                        onClick={(e) => { e.stopPropagation(); setAbierto(cierre); }}>
                        {formatearFechaHora(cierre.cerrado_en)}
                      </button>
                    </td>
                    <td data-etiqueta="Persona">{cierre.usuario_nombre}</td>
                    <td className="numero" data-etiqueta="Esperado">{formatearClp(cierre.efectivo_esperado)}</td>
                    <td className="numero" data-etiqueta="Contado">{formatearClp(cierre.efectivo_contado)}</td>
                    <td data-etiqueta="Resultado">
                      <span className="visualmente-oculto">{NOMBRE_ESTADO_CIERRE[cierre.estado]}: </span>
                      <EtiquetaDiferencia cierre={cierre} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {abierto && <DetalleCierreModal cierre={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}
