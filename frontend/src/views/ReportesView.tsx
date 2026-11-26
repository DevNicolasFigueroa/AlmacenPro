// Reportes del administrador (spec 005, RF-4 a RF-15, RF-25, RF-27): una sola pantalla con secciones
// y un período compartido (hoy por defecto). Solo la ve el administrador; el cajero tiene su propia
// pantalla para cerrar el turno y nunca ve costos, márgenes ni ganancias.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListaCierres } from '../components/ListaCierres';
import { ReporteGananciasPeriodo } from '../components/ReporteGanancias';
import { ReporteProductosPeriodo } from '../components/ReporteProductos';
import { ReporteVentasPeriodo } from '../components/ReporteVentas';
import { SelectorPeriodo } from '../components/SelectorPeriodo';
import { periodoDeHoy, validarPeriodo, type Periodo } from '../utils/periodo';
import '../styles/inventario.css';
import '../styles/reportes.css';

type Seccion = 'ventas' | 'ganancias' | 'productos' | 'cierres';

const SECCIONES: { clave: Seccion; texto: string }[] = [
  { clave: 'ventas', texto: 'Ventas' },
  { clave: 'ganancias', texto: 'Ganancias' },
  { clave: 'productos', texto: 'Productos' },
  { clave: 'cierres', texto: 'Cierres de caja' },
];

export function VistaReportes() {
  const [parametros, setParametros] = useSearchParams();
  const [periodo, setPeriodo] = useState<Periodo>(periodoDeHoy());

  const pedida = parametros.get('seccion') as Seccion | null;
  const seccion: Seccion = SECCIONES.some((s) => s.clave === pedida) ? (pedida as Seccion) : 'ventas';
  const errorPeriodo = validarPeriodo(periodo);

  function elegir(clave: Seccion) {
    const siguiente = new URLSearchParams(parametros);
    siguiente.set('seccion', clave);
    setParametros(siguiente, { replace: true });
  }

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Reportes</h2>
          <p className="pagina-descripcion">
            Cuánto se vendió, cuánto se ganó y qué conviene comprar, para el período que elijas.
          </p>
        </div>
      </header>

      <div className="segmentos segmentos--secciones" role="group" aria-label="Reportes">
        {SECCIONES.map(({ clave, texto }) => (
          <button key={clave} type="button" className="segmento segmento--simple segmento--seccion"
            aria-pressed={seccion === clave} onClick={() => elegir(clave)}>
            {texto}
          </button>
        ))}
      </div>

      <SelectorPeriodo periodo={periodo} error={errorPeriodo} onCambio={setPeriodo} />

      {seccion === 'ventas' && <ReporteVentasPeriodo periodo={periodo} valido={errorPeriodo === null} />}
      {seccion === 'ganancias' && <ReporteGananciasPeriodo periodo={periodo} valido={errorPeriodo === null} />}
      {seccion === 'productos' && <ReporteProductosPeriodo periodo={periodo} valido={errorPeriodo === null} />}
      {seccion === 'cierres' && <ListaCierres periodo={periodo} valido={errorPeriodo === null} />}
    </section>
  );
}
