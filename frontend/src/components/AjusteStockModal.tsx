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

const MOTIVOS: Record<TipoAjuste, { nombre: string; signo: string; ayuda: string }> = {
  reposicion: { nombre: 'Reposición', signo: '+', ayuda: 'Llegó mercadería y se suma' },
  merma: { nombre: 'Merma', signo: '−', ayuda: 'Se perdió, venció o se dañó' },
  correccion: { nombre: 'Corrección', signo: '=', ayuda: 'Contaste y fijas el stock real' },
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
  const baja = quedara !== null && quedara < producto.stock;

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
    <Modal
      titulo="Ajustar stock"
      subtitulo={`${producto.nombre}. Stock actual: ${formatearCantidad(producto.stock, producto.unidad_medida)}`}
      idTitulo="titulo-ajuste"
      onCerrar={onCerrar}
    >
      {!producto.activo && (
        <p className="alerta alerta--aviso">Este producto está desactivado, pero aún puedes ajustar su stock.</p>
      )}

      <form onSubmit={confirmar}>
        <div className="motivos" role="radiogroup" aria-label="Motivo del ajuste">
          {(Object.keys(MOTIVOS) as TipoAjuste[]).map((clave) => (
            <label key={clave} className={tipo === clave ? 'motivo motivo--activo' : 'motivo'}>
              <input type="radio" name="motivo" value={clave} checked={tipo === clave}
                onChange={() => setTipo(clave)} />
              <span className="motivo-nombre"><b aria-hidden="true">{MOTIVOS[clave].signo}</b>{MOTIVOS[clave].nombre}</span>
              <span className="motivo-ayuda">{MOTIVOS[clave].ayuda}</span>
            </label>
          ))}
        </div>

        <label className="campo">
          {tipo === 'correccion' ? 'Stock real contado' : 'Cantidad'}
          <div className="cantidad-caja">
            <input value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              inputMode="decimal" required autoFocus />
            <span className="cantidad-unidad">{producto.unidad_medida === 'kilo' ? 'kg' : 'u.'}</span>
          </div>
        </label>

        <label className="campo">Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255}
            placeholder="Ej: pedido del proveedor, producto vencido" />
        </label>

        {quedara !== null && !aviso && (
          <p role="status" className={baja ? 'cambio-stock cambio-stock--baja' : 'cambio-stock'}>
            <span className="cambio-stock-antes">
              Ahora {formatearCantidad(producto.stock, producto.unidad_medida)}
            </span>
            <span className="cambio-stock-despues">
              Quedará en {formatearCantidad(quedara, producto.unidad_medida)}
            </span>
          </p>
        )}
        {aviso && <p role="alert" className="alerta alerta--error">{aviso}</p>}
        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton" disabled={!puedeConfirmar}>Confirmar ajuste</button>
          <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
