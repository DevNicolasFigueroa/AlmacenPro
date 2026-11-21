// Punto de venta: controla el ciclo de la venta en curso que protege la sesión (spec 001).
// El registro de productos, stock y fiado pertenece a la spec del POS.
import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../services/api';
import { AvisoVentaPorExpirar } from '../components/AvisoVentaPorExpirar';
import type { RespuestaVentaActiva, VentaActiva } from '../types';

export function VistaPuntoVenta() {
  const [venta, setVenta] = useState<VentaActiva | null>(null);
  const [aviso, setAviso] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const consultarEstado = useCallback(async () => {
    try {
      const { data } = await api.get<RespuestaVentaActiva>('/ventas/en-curso');
      setVenta(data.ventaActiva);
      setAviso(data.aviso);
      setSegundos(data.segundosParaCancelar);
    } catch (err) {
      setError(mensajeError(err));
    }
  }, []);

  useEffect(() => {
    consultarEstado();
    const sondeo = window.setInterval(consultarEstado, 30_000);
    return () => window.clearInterval(sondeo);
  }, [consultarEstado]);

  // Cuenta regresiva local entre dos sondeos al servidor.
  useEffect(() => {
    if (!aviso) return;
    const cuenta = window.setInterval(() => {
      setSegundos((valor) => Math.max(0, valor - 1));
    }, 1000);
    return () => window.clearInterval(cuenta);
  }, [aviso]);

  async function ejecutar(accion: () => Promise<void>, texto: string) {
    setCargando(true);
    setError('');
    setMensaje('');
    try {
      await accion();
      setMensaje(texto);
      await consultarEstado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function iniciar() {
    await ejecutar(async () => {
      const { data } = await api.post<{ venta: { id: number } }>('/ventas/iniciar');
      setVenta({ id: data.venta.id, usuario_id: 0, estado: 'en_curso', iniciada_en: '', ultima_actividad: '' });
      setAviso(false);
      setSegundos(0);
    }, 'Venta iniciada. Tu sesión no se interrumpirá hasta que la termines');
  }

  async function registrarActividad() {
    if (!venta) return;
    await ejecutar(async () => {
      await api.post(`/ventas/${venta.id}/actividad`);
    }, 'Actividad registrada correctamente');
  }

  async function cancelar() {
    if (!venta) return;
    await ejecutar(async () => {
      await api.post(`/ventas/${venta.id}/cancelar`);
    }, 'Venta cancelada. Ya puedes cerrar tu sesión');
  }

  return (
    <section>
      <h2>Punto de Venta</h2>
      <p>Registra una venta completa en menos de 30 segundos.</p>

      {mensaje && <p>{mensaje}</p>}
      {error && <p role="alert">{error}</p>}
      {aviso && venta && <AvisoVentaPorExpirar segundosParaCancelar={segundos} />}

      {!venta ? (
        <button onClick={iniciar} disabled={cargando}>Iniciar venta</button>
      ) : (
        <div>
          <p><strong>Venta en curso</strong> (n.º {venta.id})</p>
          <button onClick={registrarActividad} disabled={cargando}>Registrar actividad</button>
          <button onClick={cancelar} disabled={cargando}>Cancelar venta</button>
        </div>
      )}
    </section>
  );
}
