// Período de los reportes (spec 005, RF-8): Desde y Hasta (hoy por defecto) y los atajos Hoy, Ayer,
// Esta semana y Este mes. Si el período no es válido avisa qué corregir y el reporte no consulta.
import { ATAJOS_PERIODO, type Periodo } from '../utils/periodo';

interface Props {
  periodo: Periodo;
  error: string | null;
  onCambio: (periodo: Periodo) => void;
}

export function SelectorPeriodo({ periodo, error, onCambio }: Props) {
  const ahora = new Date();

  return (
    <div className="selector-periodo">
      <div className="selector-fechas">
        <label className="campo">
          Desde
          <input type="date" value={periodo.desde} max={periodo.hasta || undefined}
            onChange={(e) => onCambio({ ...periodo, desde: e.target.value })} />
        </label>
        <label className="campo">
          Hasta
          <input type="date" value={periodo.hasta} min={periodo.desde || undefined}
            onChange={(e) => onCambio({ ...periodo, hasta: e.target.value })} />
        </label>
      </div>

      <div className="segmentos" role="group" aria-label="Períodos rápidos">
        {ATAJOS_PERIODO.map(({ clave, texto, calcular }) => {
          const propuesta = calcular(ahora);
          const activo = propuesta.desde === periodo.desde && propuesta.hasta === periodo.hasta;
          return (
            <button key={clave} type="button" className="segmento segmento--simple"
              aria-pressed={activo} onClick={() => onCambio(propuesta)}>
              {texto}
            </button>
          );
        })}
      </div>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}
    </div>
  );
}
