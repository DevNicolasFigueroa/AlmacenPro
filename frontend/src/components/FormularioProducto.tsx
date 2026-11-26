// Alta y edición de productos en una ventana modal (spec 002, RF-1 a RF-9, RF-10, RF-12).
// La interfaz solo ayuda: toda regla se valida de nuevo en el backend.
import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { api, mensajeError } from '../services/api';
import { formatearCantidad, formatearClp, parsearCantidad, parsearMonto } from '../utils/formato';
import { Modal } from './Modal';
import type { Categoria, MovimientoStock, Producto, UnidadMedida } from '../types';

interface Props {
  producto?: Producto; // sin producto: alta; con producto: edición
  categorias: Categoria[];
  onGuardado: (mensaje: string, avisos: string[]) => void;
  onAbrirAjuste?: (producto: Producto) => void;
  onCerrar: () => void;
}

interface RespuestaGuardado {
  mensaje: string;
  avisos: string[];
}

function texto(valor: number | undefined) {
  return valor === undefined ? '' : String(valor).replace('.', ',');
}

export function FormularioProducto({ producto, categorias, onGuardado, onAbrirAjuste, onCerrar }: Props) {
  const edicion = Boolean(producto);

  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [codigo, setCodigo] = useState(producto?.codigo_barras ?? '');
  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ? String(producto.categoria_id) : '');
  const [unidad, setUnidad] = useState<UnidadMedida>(producto?.unidad_medida ?? 'unidad');
  const [precioVenta, setPrecioVenta] = useState(texto(producto?.precio_venta));
  const [costo, setCosto] = useState(texto(producto?.precio_costo));
  const [stockMinimo, setStockMinimo] = useState(texto(producto?.stock_minimo));
  const [stockInicial, setStockInicial] = useState('');

  const [conHistoria, setConHistoria] = useState(false);
  const [perdida, setPerdida] = useState(false);
  const [error, setError] = useState('');
  const [errorCodigo, setErrorCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);

  // RF-12: la unidad se bloquea si el producto ya tiene movimientos (el backend también lo exige).
  useEffect(() => {
    if (!producto) return;
    api.get<MovimientoStock[]>(`/productos/${producto.id}/movimientos`)
      .then(({ data }) => setConHistoria(data.length > 0))
      .catch(() => setConHistoria(false));
  }, [producto]);

  function cambiarPrecio(setter: (valor: string) => void, valor: string) {
    setter(valor);
    setPerdida(false); // si cambian los montos, hay que volver a confirmar
  }

  // Vista previa de lo que se gana (o pierde) por cada unidad o kilo vendido.
  const venta = parsearMonto(precioVenta);
  const costoNumero = parsearMonto(costo);
  const hayMargen = !Number.isNaN(venta) && !Number.isNaN(costoNumero) && venta > 0;
  const margen = hayMargen ? venta - costoNumero : 0;
  const porcentaje = hayMargen ? Math.round((margen / venta) * 100) : 0;
  const porCada = unidad === 'kilo' ? 'kilo vendido' : 'unidad vendida';

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setErrorCodigo('');

    if (Number.isNaN(venta) || venta <= 0) {
      setError('El precio de venta debe ser un monto en pesos mayor a 0, sin decimales');
      return;
    }
    if (Number.isNaN(costoNumero)) {
      setError('El costo debe ser un monto en pesos de 0 o más, sin decimales');
      return;
    }

    const cuerpo: Record<string, unknown> = {
      nombre,
      codigo_barras: codigo,
      categoria_id: Number(categoriaId),
      unidad_medida: unidad,
      precio_venta: venta,
      precio_costo: costoNumero,
      confirmarPerdida: perdida || undefined,
    };

    if (stockMinimo.trim()) {
      const resultado = parsearCantidad(stockMinimo, unidad);
      if ('error' in resultado) {
        setError(`Stock mínimo: ${resultado.error}`);
        return;
      }
      cuerpo.stock_minimo = resultado.valor;
    }
    if (!edicion && stockInicial.trim()) {
      const resultado = parsearCantidad(stockInicial, unidad);
      if ('error' in resultado) {
        setError(`Stock inicial: ${resultado.error}`);
        return;
      }
      cuerpo.stock = resultado.valor;
    }

    setGuardando(true);
    try {
      const { data } = edicion
        ? await api.put<RespuestaGuardado>(`/productos/${producto!.id}`, cuerpo)
        : await api.post<RespuestaGuardado>('/productos', cuerpo);
      onGuardado(data.mensaje, data.avisos ?? []);
    } catch (err) {
      // RF-4: el backend pide confirmar la venta con pérdida antes de guardar.
      if (axios.isAxiosError(err) && err.response?.data?.codigo === 'VENTA_CON_PERDIDA') {
        setPerdida(true);
      } else if (/código de barras/i.test(mensajeError(err))) {
        setErrorCodigo(mensajeError(err));
      } else {
        setError(mensajeError(err));
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={edicion ? 'Editar producto' : 'Nuevo producto'}
      subtitulo={edicion ? producto!.nombre : 'Completa lo básico; el stock inicial es opcional.'}
      idTitulo="titulo-producto"
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar}>
        <fieldset className="grupo">
          <legend>Datos del producto</legend>
          <div className="formulario-columnas">
            <label className="campo campo--completo">Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={150}
                autoFocus={!edicion} />
            </label>

            <label className="campo">Categoría
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
                <option value="" disabled>Elige una categoría</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="campo">Código de barras (opcional)
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} />
            </label>
            {errorCodigo && <p role="alert" className="error-campo campo--completo">{errorCodigo}</p>}
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>Precio</legend>
          <div className="formulario-columnas">
            <label className="campo">Precio de venta (CLP)
              <input value={precioVenta} onChange={(e) => cambiarPrecio(setPrecioVenta, e.target.value)}
                inputMode="numeric" placeholder="Ej: 1.290" required />
            </label>
            <label className="campo">Costo (CLP)
              <input value={costo} onChange={(e) => cambiarPrecio(setCosto, e.target.value)}
                inputMode="numeric" placeholder="Ej: 950" required />
            </label>
            {hayMargen && (
              <p className={margen < 0 ? 'margen-vista margen-vista--perdida campo--completo' : 'margen-vista campo--completo'}>
                {margen < 0
                  ? `Pierdes ${formatearClp(-margen)} por cada ${porCada}`
                  : `Ganas ${formatearClp(margen)} por cada ${porCada} (${porcentaje} % del precio)`}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>Stock</legend>
          <div className="formulario-columnas">
            <label className="campo">Se vende por
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadMedida)}
                disabled={conHistoria}>
                <option value="unidad">Unidad</option>
                <option value="kilo">Kilo</option>
              </select>
            </label>
            <label className="campo">Stock mínimo (0 = sin alerta)
              <input value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)}
                inputMode="decimal" placeholder={unidad === 'kilo' ? 'Ej: 2,5' : 'Ej: 6'} />
            </label>
            {conHistoria && (
              <p className="ayuda campo--completo">
                La unidad no se puede cambiar: el producto ya tiene movimientos.
              </p>
            )}
            {!edicion && (
              <label className="campo campo--completo">Stock inicial (opcional)
                <input value={stockInicial} onChange={(e) => setStockInicial(e.target.value)}
                  inputMode="decimal" placeholder={unidad === 'kilo' ? 'Ej: 10,5' : 'Ej: 24'} />
              </label>
            )}
            {edicion && producto && (
              <p className="ayuda campo--completo">
                Stock actual: <strong>{formatearCantidad(producto.stock, producto.unidad_medida)}</strong>.
                El stock no se edita aquí.{' '}
                {onAbrirAjuste && (
                  <button type="button" className="boton boton--pequeno boton--secundario"
                    onClick={() => onAbrirAjuste(producto)}>
                    Ajustar stock
                  </button>
                )}
              </p>
            )}
          </div>
        </fieldset>

        {perdida && (
          <p role="alert" className="alerta alerta--aviso">
            <strong>Venderás con pérdida:</strong> el precio de venta es menor al costo.
            Si es correcto, guarda de todos modos.
          </p>
        )}
        {error && <p role="alert" className="alerta alerta--error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton" disabled={guardando}>
            {perdida ? 'Guardar de todos modos' : edicion ? 'Guardar cambios' : 'Crear producto'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
