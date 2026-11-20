// Ajuste manual de stock con motivo (spec 002, RF-22 a RF-25, RF-30).
// Muestra el resultado esperado antes de confirmar; el backend igual valida y rechaza stock negativo.
import { useState, type FormEvent } from 'react';
import { api, mensajeError } from '../services/api';
import { formatearCantidad, parsearCantidad } from '../utils/formato';
import { Modal } from './Modal';
import type { Producto, TipoAjuste } from '../types';

interface Props {
  producto: Producto;
  onAjustado: (mensaje: string) => void;
  onCerrar: () => void;
}

const MOTIVOS: Record<TipoAjuste, { nombre: string; ayuda: string }> = {
  reposicion: { nombre: 'Reposición', ayuda: 'Llegó mercadería: suma al stock' },
  merma: { nombre: 'Merma', ayuda: 'Se perdió, venció o se dañó: resta del stock' },
  correccion: { nombre: 'Corrección', ayuda: 'Contaste el stock real: lo fija en esa cantidad' },
};

export function AjusteStockModal({ producto, onAjustado, onCerrar }: Props) {
  const [tipo, setTipo] = useState<TipoAjuste>('reposicion');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Vista previa: "stock actual → quedará en".
  const analisis = cantidad.trim() ? parsearCantidad(cantidad, producto.unidad_medida) : null;
  let quedara: number | null = null;
  let aviso = '';
  if (analisis && 'error' in analisis) {
    aviso = analisis.error;
  } else if (analisis) {
    const base = tipo === 'merma' ? producto.stock - analisis.valor
      : tipo === 'reposicion' ? producto.stock + analisis.valor
        : analisis.valor;
    quedara = Math.round(base * 1000) / 1000;
    if (quedara < 0) aviso = `La merma supera el stock disponible (${formatearCantidad(producto.stock, producto.unidad_medida)})`;
    else if (tipo !== 'correccion' && analisis.valor === 0) aviso = 'La cantidad debe ser mayor a 0';
  }

  const puedeConfirmar = analisis !== null && 'valor' in analisis && !aviso && !guardando;

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!analisis || !('valor' in analisis)) return;
    setError('');
    setGuardando(true);
    try {
      await api.post(`/productos/${producto.id}/ajustes`, {
        tipo,
        cantidad: analisis.valor,
        nota: nota.trim() || undefined,
      });
      onAjustado(`Ajuste de ${MOTIVOS[tipo].nombre.toLowerCase()} registrado: ${producto.nombre}`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Ajustar stock" idTitulo="titulo-ajuste" onCerrar={onCerrar}>
      <p>
        <strong>{producto.nombre}</strong>
        {!producto.activo && <> <span className="chip chip--apagado">No disponible</span></>}
        <br />
        Stock actual: <strong>{formatearCantidad(producto.stock, producto.unidad_medida)}</strong>
      </p>

      <form onSubmit={confirmar}>
        <label className="campo">Motivo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAjuste)}>
            {(Object.keys(MOTIVOS) as TipoAjuste[]).map((clave) => (
              <option key={clave} value={clave}>{MOTIVOS[clave].nombre}</option>
            ))}
          </select>
        </label>
        <p className="ayuda">{MOTIVOS[tipo].ayuda}</p>

        <label className="campo">
          {tipo === 'correccion' ? 'Stock real contado' : 'Cantidad'}
          {producto.unidad_medida === 'kilo' ? ' (kg)' : ' (unidades)'}
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            inputMode="decimal" required autoFocus />
        </label>

        <label className="campo">Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255}
            placeholder="Ej: pedido del proveedor, producto vencido" />
        </label>

        {quedara !== null && !aviso && (
          <p role="status" className="alerta alerta--ok">
            Stock actual {formatearCantidad(producto.stock, producto.unidad_medida)}
            {' → '}quedará en <strong>{formatearCantidad(quedara, producto.unidad_medida)}</strong>
          </p>
        )}
        {aviso && <p role="alert" className="alerta alerta--error">{aviso}</p>}
        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton" disabled={!puedeConfirmar}>Confirmar</button>
          <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
