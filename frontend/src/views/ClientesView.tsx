// Clientes y fiado: listado con búsqueda, filtro por estado y orden (spec 004, RF-1 a RF-6).
// Lo ven el cajero y el administrador; solo el administrador recibe, además, el total por cobrar.
// Cada fila abre la cuenta del cliente. Si la búsqueda es un RUT válido que no existe, se ofrece
// registrar al cliente solo con su RUT.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api, mensajeError } from '../services/api';
import { EstadoSaldo } from '../components/EstadoSaldo';
import { formatearClp } from '../utils/formato';
import { esRutValido, normalizarRut } from '../utils/rut';
import type { ClienteVenta, ListadoClientes } from '../types';
import '../styles/inventario.css';
import '../styles/ventas.css';
import '../styles/clientes.css';

type Estado = 'todos' | 'deuda' | 'a_favor' | 'al_dia';
type Orden = '' | 'nombre' | 'deuda';

const SEGMENTOS: { clave: Estado; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'deuda', texto: 'En deuda' },
  { clave: 'a_favor', texto: 'A favor' },
  { clave: 'al_dia', texto: 'Al día' },
];

function IconoLupa() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function VistaClientes() {
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [estado, setEstado] = useState<Estado>('todos');
  const [orden, setOrden] = useState<Orden>('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<ListadoClientes | null>(null);
  const [error, setError] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const ultimaConsulta = useRef(0);

  // Espera un instante tras la última tecla para no consultar en cada letra.
  useEffect(() => {
    const espera = window.setTimeout(() => {
      setBusquedaAplicada(busqueda.trim());
      setPagina(1);
    }, 250);
    return () => window.clearTimeout(espera);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    const consulta = ultimaConsulta.current + 1;
    ultimaConsulta.current = consulta;
    setError('');
    try {
      const { data } = await api.get<ListadoClientes>('/clientes', {
        params: {
          buscar: busquedaAplicada || undefined,
          estado: estado === 'todos' ? undefined : estado,
          orden: orden || undefined,
          pagina: pagina > 1 ? pagina : undefined,
        },
      });
      // Si se escribió algo más mientras tanto, esta respuesta ya quedó vieja.
      if (consulta === ultimaConsulta.current) setDatos(data);
    } catch (err) {
      if (consulta === ultimaConsulta.current) setError(mensajeError(err));
    }
  }, [busquedaAplicada, estado, orden, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  function elegirEstado(clave: Estado) {
    setEstado(clave);
    setPagina(1);
  }

  // Sin resultados y con un RUT válido: se registra al cliente solo con su RUT y se abre su cuenta.
  async function registrarDesdeBusqueda() {
    setError('');
    setRegistrando(true);
    try {
      const { data } = await api.post<{ cliente: ClienteVenta }>('/clientes', {
        rut: normalizarRut(busquedaAplicada),
      });
      navegar(`/clientes/${data.cliente.id}`);
    } catch (err) {
      // Si alguien lo registró mientras tanto, se abre ese cliente.
      if (isAxiosError(err) && err.response?.data?.codigo === 'RUT_REPETIDO') {
        navegar(`/clientes/${(err.response.data.cliente as ClienteVenta).id}`);
      } else {
        setError(mensajeError(err));
      }
    } finally {
      setRegistrando(false);
    }
  }

  const clientes = datos?.clientes ?? [];
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;
  const hayFiltros = Boolean(busquedaAplicada) || estado !== 'todos';
  const puedeRegistrar = datos !== null && clientes.length === 0 && esRutValido(busquedaAplicada);

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Clientes y fiado</h2>
          <p className="pagina-descripcion">
            Busca a un cliente para ver su cuenta, anotar un abono y saber si está en deuda.
          </p>
        </div>
      </header>

      {datos?.resumen && (
        <div className="caja-periodo" aria-live="polite">
          <div className="caja-vendido">
            <span>Por cobrar</span>
            <strong>{formatearClp(datos.resumen.total_por_cobrar)}</strong>
          </div>
          <p className="caja-aparte">
            {datos.resumen.clientes_en_deuda}{' '}
            {datos.resumen.clientes_en_deuda === 1 ? 'cliente está en deuda' : 'clientes están en deuda'}.
            Los saldos a favor no se descuentan de este total.
          </p>
        </div>
      )}

      <div className="herramientas">
        <label className="campo">
          Buscar cliente
          <div className="buscador">
            <IconoLupa />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="RUT (con o sin puntos) o nombre" autoComplete="off" autoFocus />
          </div>
        </label>
        <label className="campo">
          Ordenar por
          <select value={orden} onChange={(e) => { setOrden(e.target.value as Orden); setPagina(1); }}>
            <option value="">{estado === 'deuda' ? 'Mayor deuda' : 'Nombre'}</option>
            <option value={estado === 'deuda' ? 'nombre' : 'deuda'}>
              {estado === 'deuda' ? 'Nombre' : 'Mayor deuda'}
            </option>
          </select>
        </label>
      </div>

      <div className="segmentos" role="group" aria-label="Filtrar por estado de la cuenta">
        {SEGMENTOS.map(({ clave, texto }) => (
          <button key={clave} type="button" className="segmento segmento--simple"
            aria-pressed={estado === clave} onClick={() => elegirEstado(clave)}>
            {texto}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="alerta alerta--error">{error}</p>}

      {clientes.length > 0 && (
        <div className="tabla-contenedor tabla-contenedor--libre">
          <table className="tabla tabla-historial tabla-clientes">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>RUT</th>
                <th>Teléfono</th>
                <th className="numero">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id}
                  className={cliente.estado === 'deuda' ? 'fila--abrible fila--deuda' : 'fila--abrible'}
                  onClick={() => navegar(`/clientes/${cliente.id}`)}>
                  <td className="celda-venta">
                    <Link to={`/clientes/${cliente.id}`} className="enlace-fila"
                      onClick={(e) => e.stopPropagation()}>
                      {cliente.nombre ?? 'Sin nombre'}
                    </Link>
                  </td>
                  <td data-etiqueta="RUT" className="celda-rut">{cliente.rut_formateado}</td>
                  <td data-etiqueta="Teléfono">{cliente.telefono ?? '—'}</td>
                  <td className="numero celda-saldo" data-etiqueta="Saldo">
                    <EstadoSaldo estado={cliente.estado} saldo={cliente.saldo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && clientes.length === 0 && (
        <div className="vacio">
          <strong>{hayFiltros ? 'No hay clientes con ese dato' : 'Todavía no hay clientes registrados'}</strong>
          <p>
            {puedeRegistrar
              ? 'Ese RUT no está registrado. Puedes registrarlo ahora con solo su RUT.'
              : hayFiltros
                ? 'Revisa lo escrito o cambia el filtro.'
                : 'Los clientes se registran al venderles, con su RUT.'}
          </p>
          {puedeRegistrar && (
            <button type="button" className="boton" disabled={registrando} onClick={registrarDesdeBusqueda}>
              Registrar cliente con este RUT
            </button>
          )}
        </div>
      )}

      {datos && datos.total > datos.por_pagina && (
        <nav className="paginacion" aria-label="Páginas del listado">
          <button type="button" className="boton boton--pequeno boton--secundario"
            disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span>Página {pagina} de {totalPaginas}</span>
          <button type="button" className="boton boton--pequeno boton--secundario"
            disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
