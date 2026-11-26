// Punto de venta (spec 003): buscar productos, armar el carrito y ver el total al instante.
// Cada cambio se guarda en el servidor y cuenta como actividad de la venta (spec 001), así el
// aviso y la cancelación por inactividad no se activan mientras se atiende.
import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import { AvisoVentaPorExpirar } from '../components/AvisoVentaPorExpirar';
import { BuscadorProductos } from '../components/BuscadorProductos';
import { CarritoVenta } from '../components/CarritoVenta';
import { Modal } from '../components/Modal';
import { PanelCobro } from '../components/PanelCobro';
import { ResumenVentaConfirmada } from '../components/ResumenVentaConfirmada';
import { formatearCantidad, formatearClp } from '../utils/formato';
import type {
  Carrito, ClienteVenta, LineaVenta, ProblemaConfirmacion, ProductoVendible,
  RespuestaConfirmacion, RespuestaVentaActiva, UltimaVenta, VentaActiva,
} from '../types';
import '../styles/ventas.css';

const NOMBRE_METODO: Record<string, string> = {
  efectivo: 'efectivo', debito: 'débito', credito: 'crédito', fiado: 'fiado',
};

export function VistaPuntoVenta() {
  const [venta, setVenta] = useState<VentaActiva | null>(null);
  const [carrito, setCarrito] = useState<Carrito>({ lineas: [], total: 0 });
  const [ultimaVenta, setUltimaVenta] = useState<UltimaVenta | null>(null);
  const [aviso, setAviso] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [problemas, setProblemas] = useState<Record<number, string>>({});
  const [confirmada, setConfirmada] = useState<
    { resumen: RespuestaConfirmacion; cliente: ClienteVenta | null } | null
  >(null);

  const consultarEstado = useCallback(async () => {
    try {
      const { data } = await api.get<RespuestaVentaActiva>('/ventas/en-curso');
      setVenta(data.ventaActiva);
      setCarrito({ lineas: data.lineas, total: data.total });
      setAviso(data.aviso);
      setSegundos(data.segundosParaCancelar);
      setUltimaVenta(data.ultimaVenta);
      return data;
    } catch (err) {
      setError(mensajeError(err));
      return null;
    }
  }, []);

  useEffect(() => {
    consultarEstado();
  }, [consultarEstado]);

  // Cada 30 s se revisa el aviso de inactividad. Si la venta se canceló sola, se informa.
  useEffect(() => {
    const sondeo = window.setInterval(async () => {
      const habiaVenta = Boolean(venta);
      const data = await consultarEstado();
      if (habiaVenta && data && !data.ventaActiva) {
        setMensaje('La venta se canceló por inactividad. Puedes iniciar una nueva.');
      }
    }, 30_000);
    return () => window.clearInterval(sondeo);
  }, [consultarEstado, venta]);

  // Cuenta regresiva local entre dos sondeos al servidor.
  useEffect(() => {
    if (!aviso) return;
    const cuenta = window.setInterval(() => {
      setSegundos((valor) => Math.max(0, valor - 1));
    }, 1000);
    return () => window.clearInterval(cuenta);
  }, [aviso]);

  // Ejecuta una acción sobre el carrito. Devuelve true si el servidor la aceptó; si no, muestra
  // el motivo en español (stock, producto desactivado, cantidad...).
  async function actuar(accion: () => Promise<Carrito>): Promise<boolean> {
    setCargando(true);
    setError('');
    setMensaje('');
    try {
      const nuevo = await accion();
      setCarrito(nuevo);
      setProblemas({});
      setAviso(false);
      return true;
    } catch (err) {
      setError(mensajeError(err));
      return false;
    } finally {
      setCargando(false);
    }
  }

  async function iniciar() {
    setCargando(true);
    setError('');
    setMensaje('');
    setConfirmada(null);
    try {
      await api.post('/ventas/iniciar');
      await consultarEstado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  function agregar(producto: ProductoVendible, cantidad: number) {
    if (!venta) return Promise.resolve(false);
    return actuar(async () => {
      const { data } = await api.post<Carrito>(`/ventas/${venta.id}/lineas`, {
        producto_id: producto.id, cantidad,
      });
      return data;
    });
  }

  function cambiarCantidad(linea: LineaVenta, cantidad: number) {
    if (!venta) return Promise.resolve(false);
    return actuar(async () => {
      const { data } = await api.patch<Carrito>(
        `/ventas/${venta.id}/lineas/${linea.producto_id}`, { cantidad }
      );
      return data;
    });
  }

  function quitar(linea: LineaVenta) {
    if (!venta) return;
    actuar(async () => (await api.delete<Carrito>(`/ventas/${venta.id}/lineas/${linea.producto_id}`)).data);
  }

  function vaciar() {
    if (!venta) return;
    actuar(async () => (await api.delete<Carrito>(`/ventas/${venta.id}/lineas`)).data);
  }

  // RF-26, RF-27: la venta se rechazó completa; se marcan las líneas que hay que corregir.
  function alHaberProblemas(lista: ProblemaConfirmacion[], texto: string) {
    setCobrando(false);
    setProblemas(Object.fromEntries(
      lista.filter((p) => p.productoId !== undefined).map((p) => [p.productoId as number, p.mensaje])
    ));
    setError(`${texto}. Corrige el carrito y vuelve a cobrar.`);
    consultarEstado();
  }

  function alConfirmar(resumen: RespuestaConfirmacion, cliente: ClienteVenta | null) {
    setCobrando(false);
    setProblemas({});
    setConfirmada({ resumen, cliente });
    window.dispatchEvent(new Event('stock-cambiado'));
    setVenta(null);
    setCarrito({ lineas: [], total: 0 });
    setAviso(false);
    consultarEstado();
  }

  // RF-30: la venta ya estaba confirmada (doble clic o reintento): se muestra su estado real.
  async function alYaConfirmada() {
    setCobrando(false);
    await consultarEstado();
    setMensaje('Esa venta ya estaba confirmada, no se cobró dos veces. Mira abajo su detalle.');
  }

  // RF-30: sin respuesta del servidor no se sabe si la venta quedó registrada. Se consulta su
  // estado real antes de volver a cobrar, para no cobrar dos veces.
  async function alSinRespuesta() {
    setCobrando(false);
    await consultarEstado();
    setMensaje('No hubo respuesta al confirmar. Revisa la última venta antes de volver a cobrar.');
  }

  async function cancelar() {
    if (!venta) return;
    setConfirmandoCancelar(false);
    setCargando(true);
    setError('');
    try {
      await api.post(`/ventas/${venta.id}/cancelar`);
      await consultarEstado();
      setProblemas({});
      setMensaje('Venta cancelada. Ya puedes cerrar tu sesión.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  const enCarrito = Object.fromEntries(
    carrito.lineas.map((linea) => [linea.producto_id, linea.cantidad])
  ) as Record<number, number>;

  return (
    <section className="pagina pagina--venta">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Punto de venta</h2>
          <p className="pagina-descripcion">
            Agrega los productos y dile al cliente el total. Cada cambio queda guardado al instante.
          </p>
        </div>
      </header>

      {mensaje && <p role="status" className="alerta alerta--ok">{mensaje}</p>}
      {error && <p role="alert" className="alerta alerta--error">{error}</p>}
      {aviso && venta && <AvisoVentaPorExpirar segundosParaCancelar={segundos} />}

      {confirmada && !venta ? (
        <ResumenVentaConfirmada resumen={confirmada.resumen} cliente={confirmada.cliente}
          onNuevaVenta={iniciar} />
      ) : !venta ? (
        <div className="inicio-venta">
          <button type="button" className="boton boton--grande" onClick={iniciar} disabled={cargando}>
            Nueva venta
          </button>
          {ultimaVenta && (
            <p className="inicio-venta-ultima">
              Última venta: n.º {ultimaVenta.id} por {formatearClp(ultimaVenta.total)} en{' '}
              {NOMBRE_METODO[ultimaVenta.metodo_pago] ?? ultimaVenta.metodo_pago}.
            </p>
          )}
        </div>
      ) : (
        <div className="venta-grid">
          <BuscadorProductos enCarrito={enCarrito} deshabilitado={cargando} onAgregar={agregar} />
          <CarritoVenta
            numero={venta.id}
            lineas={carrito.lineas}
            total={carrito.total}
            deshabilitado={cargando}
            problemas={problemas}
            onCobrar={() => setCobrando(true)}
            onCambiarCantidad={cambiarCantidad}
            onQuitar={quitar}
            onVaciar={vaciar}
            onCancelar={() => setConfirmandoCancelar(true)}
          />
        </div>
      )}

      {cobrando && venta && (
        <PanelCobro ventaId={venta.id} total={carrito.total} onCerrar={() => setCobrando(false)}
          onConfirmada={alConfirmar} onProblemas={alHaberProblemas} onYaConfirmada={alYaConfirmada}
          onSinRespuesta={alSinRespuesta} />
      )}

      {confirmandoCancelar && venta && (
        <Modal titulo="¿Cancelar la venta?" idTitulo="titulo-cancelar-venta"
          subtitulo={`Venta n.º ${venta.id}`} onCerrar={() => setConfirmandoCancelar(false)}>
          <p>
            {carrito.lineas.length > 0
              ? `Se descartan ${carrito.lineas.length === 1 ? 'el producto' : `los ${carrito.lineas.length} productos`} del carrito (${formatearClp(carrito.total)}). `
              : ''}
            La venta queda registrada como cancelada y no cambia el stock ni la deuda de nadie.
          </p>
          {carrito.lineas.length > 0 && (
            <p className="ayuda">
              Productos: {carrito.lineas.map((linea) =>
                `${linea.nombre} (${formatearCantidad(linea.cantidad, linea.unidad_medida)})`).join(', ')}.
            </p>
          )}
          <div className="acciones">
            <button type="button" className="boton boton--peligro" onClick={cancelar}>
              Cancelar venta
            </button>
            <button type="button" className="boton boton--secundario"
              onClick={() => setConfirmandoCancelar(false)}>
              Seguir vendiendo
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
