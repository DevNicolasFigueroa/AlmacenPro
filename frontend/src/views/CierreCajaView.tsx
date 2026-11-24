// Cierre de caja de cada persona (spec 005, RF-16 a RF-22, RF-26): quien atiende el mesón, cajero o
// administrador, cuenta el efectivo de la caja y cierra su propio turno. El conteo es a ciegas: la
// pantalla no muestra ventas, abonos ni lo esperado hasta que se confirma el cierre; recién entonces se
// ve si la caja cuadra, sobra o falta. Un cierre no se puede deshacer. Abajo, "Mis cierres".
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import { useAutenticacion } from '../context/AutenticacionContext';
import { DetalleCierreModal } from '../components/DetalleCierreModal';
import { Modal } from '../components/Modal';
import { describirDiferencia, formatearClp, formatearFechaHora, parsearMonto } from '../utils/formato';
import type { CierreCaja, RespuestaCierre, RespuestaListaCierres, TurnoActual } from '../types';
import '../styles/ventas.css';
import '../styles/reportes.css';

const MONTO_MAXIMO = 99_999_999;

// RF-17: pesos enteros de 0 o más. Devuelve el monto o un mensaje que dice qué corregir.
function leerMonto(texto: string, nombre: string): { monto: number } | { error: string } {
  if (texto.trim() === '') return { error: `Escribe ${nombre} en pesos` };
  const monto = parsearMonto(texto);
  if (Number.isNaN(monto)) return { error: `Escribe ${nombre} en pesos enteros, sin decimales` };
  if (monto > MONTO_MAXIMO) return { error: `El máximo es ${formatearClp(MONTO_MAXIMO)}` };
  return { monto };
}

export function VistaCierreCaja() {
  const { usuario } = useAutenticacion();
  const [turno, setTurno] = useState<TurnoActual | null>(null);
  const [cierres, setCierres] = useState<CierreCaja[]>([]);
  const [fondo, setFondo] = useState('');
  const [contado, setContado] = useState('');
  const [observacion, setObservacion] = useState('');
  const [errorCampo, setErrorCampo] = useState('');
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaCierre | null>(null);
  const [detalle, setDetalle] = useState<CierreCaja | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [turnoActual, lista] = await Promise.all([
        api.get<TurnoActual>('/cierres-caja/turno'),
        api.get<RespuestaListaCierres>('/cierres-caja'),
      ]);
      setTurno(turnoActual.data);
      setCierres(lista.data.cierres);
      // El fondo se sugiere con el efectivo contado del cierre anterior; la persona lo corrige si hace falta.
      setFondo(turnoActual.data.fondo_sugerido !== null ? String(turnoActual.data.fondo_sugerido) : '');
      setContado('');
      setObservacion('');
    } catch (err) {
      setError(mensajeError(err));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const lectoFondo = leerMonto(fondo, 'el fondo inicial');
  const lectoContado = leerMonto(contado, 'el efectivo contado');
  const bloqueado = turno?.venta_en_curso ?? false;

  // RF-17: se valida antes de pedir la confirmación final.
  function pedirConfirmacion(evento: FormEvent) {
    evento.preventDefault();
    setError('');
    if ('error' in lectoFondo) { setErrorCampo(lectoFondo.error); return; }
    if ('error' in lectoContado) { setErrorCampo(lectoContado.error); return; }
    setErrorCampo('');
    setConfirmando(true);
  }

  // RF-19, RF-24: el cierre se envía una sola vez; el servidor rechaza un segundo envío del mismo turno.
  async function cerrar() {
    if (!turno || 'error' in lectoFondo || 'error' in lectoContado) return;
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post<RespuestaCierre>('/cierres-caja', {
        cierre_anterior_id: turno.cierre_anterior_id,
        fondo_inicial: lectoFondo.monto,
        efectivo_contado: lectoContado.monto,
        observacion: observacion.trim() || undefined,
      });
      setResultado(data);
      setConfirmando(false);
      await cargar();
    } catch (err) {
      setConfirmando(false);
      setError(mensajeError(err));
      // Si el turno ya se cerró o cambió, se recarga para mostrar el estado real.
      if (isAxiosError(err) && err.response?.status === 409) await cargar();
    } finally {
      setEnviando(false);
    }
  }

  const cierre = resultado?.cierre;

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Cerrar mi turno</h2>
          <p className="pagina-descripcion">
            Cuenta el efectivo de la caja y anótalo. Al confirmar verás si la caja cuadra.
            {usuario?.rol === 'administrador' && (
              <> <Link to="/reportes?seccion=cierres" className="enlace-fila">Ver los cierres de todos</Link>.</>
            )}
          </p>
        </div>
      </header>

      {cierre && resultado && (
        <div className={`resultado-cierre resultado-cierre--${resultado.resultado.estado}`} role="status">
          <strong>{resultado.resultado.texto}</strong>
          <span>
            Esperado {formatearClp(cierre.efectivo_esperado)} · contado {formatearClp(cierre.efectivo_contado)}
          </span>
          <dl className="resultado-resumen">
            <div><dt>Ventas ({cierre.cantidad_ventas})</dt><dd>{formatearClp(cierre.ventas_efectivo + cierre.ventas_debito + cierre.ventas_credito + cierre.ventas_fiado)}</dd></div>
            <div><dt>En efectivo</dt><dd>{formatearClp(cierre.ventas_efectivo)}</dd></div>
            <div><dt>Abonos en efectivo</dt><dd>{formatearClp(cierre.abonos_efectivo)}</dd></div>
            {cierre.efectivo_devuelto > 0 && <div><dt>Devuelto por anulaciones</dt><dd>{formatearClp(cierre.efectivo_devuelto)}</dd></div>}
          </dl>
          <div className="acciones">
            <button type="button" className="boton boton--secundario" onClick={() => setDetalle(cierre)}>
              Ver el detalle completo
            </button>
            <button type="button" className="boton" onClick={() => setResultado(null)}>Entendido</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {turno && bloqueado && (
        <p role="alert" className="alerta alerta--aviso">
          Tienes una venta en curso: termínala o cancélala antes de cerrar tu turno.{' '}
          <Link to="/ventas" className="enlace-fila">Ir a la venta</Link>
        </p>
      )}

      {turno && (
        <form className="hoja formulario-cierre" onSubmit={pedirConfirmacion}>
          <p className="ayuda">
            {turno.desde
              ? `Tu turno empezó el ${formatearFechaHora(turno.desde)}`
              : 'Todavía no tienes ventas ni abonos en este turno: puedes cerrarlo igual.'}
          </p>

          <div className="cobro-efectivo">
            <label className="campo">
              Fondo inicial (el efectivo con el que empezaste)
              <div className="cantidad-caja">
                <input value={fondo} inputMode="numeric" autoComplete="off" placeholder="$0" disabled={bloqueado}
                  onChange={(e) => { setFondo(e.target.value); setErrorCampo(''); }} />
              </div>
            </label>
            {turno.fondo_sugerido !== null && (
              <p className="ayuda">Sugerido: lo que contaste en tu cierre anterior ({formatearClp(turno.fondo_sugerido)}).</p>
            )}

            <label className="campo">
              Efectivo contado ahora en la caja
              <div className="cantidad-caja">
                <input value={contado} inputMode="numeric" autoComplete="off" placeholder="$0" disabled={bloqueado}
                  autoFocus onChange={(e) => { setContado(e.target.value); setErrorCampo(''); }} />
              </div>
            </label>
          </div>

          <label className="campo">
            Observación (opcional)
            <input value={observacion} maxLength={255} disabled={bloqueado}
              onChange={(e) => setObservacion(e.target.value)} placeholder="Por ejemplo: faltó dar un vuelto" />
          </label>

          {errorCampo && <p role="alert" className="error-campo">{errorCampo}</p>}

          <div className="acciones">
            <button type="submit" className="boton boton--grande" disabled={bloqueado || enviando}>
              Cerrar mi turno
            </button>
          </div>
        </form>
      )}

      <h3 className="pagina-subtitulo cuenta-seccion">Mis cierres</h3>
      {cierres.length === 0 ? (
        <p className="pagina-descripcion">Todavía no tienes cierres en los últimos 7 días.</p>
      ) : (
        <div className="tabla-contenedor tabla-contenedor--libre">
          <table className="tabla tabla-historial tabla-cierres">
            <thead>
              <tr><th>Cierre</th><th className="numero">Esperado</th><th className="numero">Contado</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {cierres.map((c) => (
                <tr key={c.id} className={c.diferencia !== 0 ? `fila--abrible fila--${c.estado}` : 'fila--abrible'}
                  onClick={() => setDetalle(c)}>
                  <td className="celda-venta">
                    <button type="button" className="enlace-fila" aria-label={`Ver el detalle del cierre ${c.id}`}
                      onClick={(e) => { e.stopPropagation(); setDetalle(c); }}>
                      {formatearFechaHora(c.cerrado_en)}
                    </button>
                  </td>
                  <td className="numero" data-etiqueta="Esperado">{formatearClp(c.efectivo_esperado)}</td>
                  <td className="numero" data-etiqueta="Contado">{formatearClp(c.efectivo_contado)}</td>
                  <td data-etiqueta="Resultado">
                    <span className={c.estado === 'falta' ? 'chip chip--peligro' : c.estado === 'sobra' ? 'chip chip--alerta' : 'chip'}>
                      {describirDiferencia(c.diferencia)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmando && !('error' in lectoFondo) && !('error' in lectoContado) && (
        <Modal titulo="¿Cerrar tu turno?" idTitulo="titulo-confirmar-cierre" onCerrar={() => !enviando && setConfirmando(false)}>
          <p>Un cierre no se puede deshacer. Revisa lo que contaste:</p>
          <dl className="cobrado-lista">
            <div><dt>Fondo inicial</dt><dd>{formatearClp(lectoFondo.monto)}</dd></div>
            <div className="cobrado-total"><dt>Efectivo contado</dt><dd>{formatearClp(lectoContado.monto)}</dd></div>
          </dl>
          <p className="ayuda">
            Después verás si la caja cuadra. Lo que vendas o cobres desde ahora va al turno siguiente.
          </p>
          <div className="acciones">
            <button type="button" className="boton" disabled={enviando} onClick={cerrar} autoFocus>
              {enviando ? 'Cerrando…' : 'Sí, cerrar mi turno'}
            </button>
            <button type="button" className="boton boton--secundario" disabled={enviando}
              onClick={() => setConfirmando(false)}>
              Volver y revisar
            </button>
          </div>
        </Modal>
      )}

      {detalle && <DetalleCierreModal cierre={detalle} onCerrar={() => setDetalle(null)} />}
    </section>
  );
}
