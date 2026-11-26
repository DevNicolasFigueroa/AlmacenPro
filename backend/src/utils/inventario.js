// Funciones puras de decisión del módulo de productos e inventario (spec 002).
// Ninguna lee reloj, base de datos ni red.
export const UNIDADES = ['unidad', 'kilo'];
export const LONGITUD_MAXIMA_NOMBRE = 150;
export const LONGITUD_MAXIMA_CODIGO_BARRAS = 20;
export const DECIMALES_KILO = 3;
// Topes que respetan las columnas: DECIMAL(11,2) para precios y DECIMAL(10,3) para cantidades.
export const PRECIO_MAXIMO = 999999999;
export const CANTIDAD_MAXIMA = 9999999.999;

// Convierte número o texto numérico simple ("12", "2.5") en número; si no, devuelve NaN.
function comoNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor === 'string' && /^\d+(\.\d+)?$/.test(valor.trim())) return Number(valor.trim());
  return NaN;
}

function estaVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

// RF-1, RF-7: solo se manejan productos por unidad o por kilo.
export function esUnidadValida(unidad) {
  return UNIDADES.includes(unidad);
}

// RF-2: recorta y colapsa los espacios internos.
export function normalizarNombre(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

// RF-2: no vacío y hasta 150 caracteres.
export function esNombreValido(valor) {
  const nombre = normalizarNombre(valor);
  return nombre.length > 0 && nombre.length <= LONGITUD_MAXIMA_NOMBRE;
}

// RF-3: precio de venta entero en CLP, mayor que 0.
export function esPrecioVentaValido(valor) {
  const numero = comoNumero(valor);
  return Number.isInteger(numero) && numero > 0 && numero <= PRECIO_MAXIMO;
}

// RF-3: costo entero en CLP, igual o mayor que 0.
export function esCostoValido(valor) {
  const numero = comoNumero(valor);
  return Number.isInteger(numero) && numero >= 0 && numero <= PRECIO_MAXIMO;
}

// RF-4: vender igual al costo no es pérdida; solo si el precio es menor.
export function hayVentaConPerdida(precioVenta, costo) {
  const venta = comoNumero(precioVenta);
  const costoNumerico = comoNumero(costo);
  if (Number.isNaN(venta) || Number.isNaN(costoNumerico)) return false;
  return venta < costoNumerico;
}

// RF-5, RF-6: recorta; un código vacío se guarda como ausente (null).
export function normalizarCodigoBarras(valor) {
  const texto = String(valor ?? '').trim();
  return texto === '' ? null : texto;
}

// RF-5, RF-6: sin código es válido; con código, de 1 a 20 caracteres alfanuméricos.
export function esCodigoBarrasValido(codigo) {
  if (codigo === null) return true;
  return typeof codigo === 'string'
    && codigo.length >= 1
    && codigo.length <= LONGITUD_MAXIMA_CODIGO_BARRAS
    && /^[A-Za-z0-9]+$/.test(codigo);
}

// RNF-1: fija 3 decimales para que sumar kilos no arrastre errores de coma flotante.
export function redondearCantidad(valor) {
  return Math.round(Number(valor) * 1000) / 1000;
}

// RF-7, RF-24: no negativa; entera si es por unidad, hasta 3 decimales si es por kilo.
export function cantidadValidaParaUnidad(cantidad, unidad) {
  if (!esUnidadValida(unidad)) return false;
  const numero = comoNumero(cantidad);
  if (Number.isNaN(numero) || numero < 0 || numero > CANTIDAD_MAXIMA) return false;
  if (unidad === 'unidad') return Number.isInteger(numero);
  return Math.abs(redondearCantidad(numero) - numero) < 1e-9;
}

// RF-12: la unidad solo se puede cambiar mientras el producto no tenga movimientos ni ventas.
export function puedeCambiarUnidad(unidadActual, unidadNueva, tieneVentasOMovimientos) {
  if (!esUnidadValida(unidadNueva)) return false;
  return unidadActual === unidadNueva || !tieneVentasOMovimientos;
}

// RF-1–3, RF-5–9: valida los datos del producto y devuelve los valores normalizados
// ({ valores }) o el primer error en español ({ error }).
// modo 'creacion' acepta además el stock inicial; en 'edicion' ese campo se ignora (RF-10).
export function validarDatosProducto(datos, modo = 'creacion') {
  const origen = datos ?? {};

  const nombre = normalizarNombre(origen.nombre);
  if (!esNombreValido(nombre)) {
    return { error: `Ingresa el nombre del producto (hasta ${LONGITUD_MAXIMA_NOMBRE} caracteres)` };
  }

  const categoriaId = Number(origen.categoria_id);
  if (estaVacio(origen.categoria_id) || !Number.isInteger(categoriaId) || categoriaId <= 0) {
    return { error: 'Elige una categoría de la lista' };
  }

  const unidad = origen.unidad_medida;
  if (!esUnidadValida(unidad)) {
    return { error: 'Elige si el producto se vende por unidad o por kilo' };
  }

  if (!esPrecioVentaValido(origen.precio_venta)) {
    return { error: 'El precio de venta debe ser un monto en pesos mayor a 0, sin decimales' };
  }
  if (!esCostoValido(origen.precio_costo)) {
    return { error: 'El costo debe ser un monto en pesos de 0 o más, sin decimales' };
  }

  const codigoBarras = normalizarCodigoBarras(origen.codigo_barras);
  if (!esCodigoBarrasValido(codigoBarras)) {
    return { error: `El código de barras debe tener solo letras y números (hasta ${LONGITUD_MAXIMA_CODIGO_BARRAS} caracteres)` };
  }

  const textoCantidad = unidad === 'unidad' ? 'un número entero' : 'un número con hasta 3 decimales';

  let stockMinimo = 0;
  if (!estaVacio(origen.stock_minimo)) {
    if (!cantidadValidaParaUnidad(origen.stock_minimo, unidad)) {
      return { error: `El stock mínimo debe ser ${textoCantidad}, de 0 o más` };
    }
    stockMinimo = redondearCantidad(comoNumero(origen.stock_minimo));
  }

  let stockInicial = 0;
  if (modo === 'creacion' && !estaVacio(origen.stock)) {
    if (!cantidadValidaParaUnidad(origen.stock, unidad)) {
      return { error: `El stock inicial debe ser ${textoCantidad}, de 0 o más` };
    }
    stockInicial = redondearCantidad(comoNumero(origen.stock));
  }

  const valores = {
    nombre,
    codigoBarras,
    categoriaId,
    unidad,
    precioVenta: comoNumero(origen.precio_venta),
    costo: comoNumero(origen.precio_costo),
    stockMinimo,
  };
  if (modo === 'creacion') valores.stockInicial = stockInicial;

  return { valores };
}

// ---------------------------------------------------------------------------
// Ajuste manual de stock, historial y estado de stock (T2)
// ---------------------------------------------------------------------------
export const TIPOS_AJUSTE = ['merma', 'reposicion', 'correccion'];
export const LONGITUD_MAXIMA_NOTA = 255;

function aviso(codigo, mensaje, stockActual) {
  return { ok: false, codigo, mensaje, stockActual };
}

// RF-22–25: la merma resta, la reposición suma y la corrección fija el stock real.
// Devuelve { ok: true, stockNuevo, diferencia } o { ok: false, codigo, mensaje, stockActual }.
export function calcularAjuste({ tipo, cantidad, stockActual, unidad }) {
  const actual = redondearCantidad(stockActual);

  if (!TIPOS_AJUSTE.includes(tipo)) {
    return aviso('MOTIVO_INVALIDO', 'Elige el motivo: merma, reposición o corrección', actual);
  }

  const formato = unidad === 'kilo' ? 'un número con hasta 3 decimales' : 'un número entero';
  if (!cantidadValidaParaUnidad(cantidad, unidad)) {
    return aviso('CANTIDAD_INVALIDA', `La cantidad debe ser ${formato}, de 0 o más`, actual);
  }

  const numero = redondearCantidad(comoNumero(cantidad));
  // Solo la corrección admite 0 (contar y dejar el stock en cero).
  if (tipo !== 'correccion' && numero <= 0) {
    return aviso('CANTIDAD_INVALIDA', 'La cantidad debe ser mayor a 0', actual);
  }

  let stockNuevo;
  if (tipo === 'merma') stockNuevo = redondearCantidad(actual - numero);
  else if (tipo === 'reposicion') stockNuevo = redondearCantidad(actual + numero);
  else stockNuevo = numero;

  if (stockNuevo < 0) {
    return aviso('STOCK_INSUFICIENTE', `La merma supera el stock disponible (${actual})`, actual);
  }
  if (stockNuevo > CANTIDAD_MAXIMA) {
    return aviso('CANTIDAD_INVALIDA', 'El stock resultante supera el máximo permitido', actual);
  }

  return { ok: true, stockNuevo, diferencia: redondearCantidad(stockNuevo - actual) };
}

// RF-8, RF-26: arma la fila del historial. La cantidad es la diferencia con signo
// (positiva suma, negativa resta) y la fecha llega en "hoy".
export function armarMovimiento({
  productoId, usuarioId, tipo, stockAntes, stockDespues, nota, ventaId = null, hoy,
}) {
  const texto = String(nota ?? '').trim().slice(0, LONGITUD_MAXIMA_NOTA);
  return {
    productoId,
    usuarioId,
    tipo,
    cantidad: redondearCantidad(Number(stockDespues) - Number(stockAntes)),
    stockAntes: redondearCantidad(stockAntes),
    stockDespues: redondearCantidad(stockDespues),
    nota: texto === '' ? null : texto,
    ventaId,
    creadoEn: hoy,
  };
}

// RF-31, RF-32, RF-34: se calcula en cada lectura, nunca se guarda.
// Agotado: stock 0. Bajo: mínimo mayor a 0 y stock igual o menor a él.
// Un producto desactivado no genera alertas.
export function estadoStock({ stock, stockMinimo, activo }) {
  if (!activo) return 'sin_alerta';
  const actual = Number(stock);
  const minimo = Number(stockMinimo);
  if (actual === 0) return 'agotado';
  if (minimo > 0 && actual <= minimo) return 'bajo';
  return 'normal';
}

// RF-33, RF-34: cuenta alertas de productos activos (filas con stock, stock_minimo y activo).
export function resumirAlertas(productos) {
  const resumen = { stockBajo: 0, agotados: 0 };
  for (const producto of productos) {
    const estado = estadoStock({
      stock: producto.stock,
      stockMinimo: producto.stock_minimo,
      activo: producto.activo,
    });
    if (estado === 'bajo') resumen.stockBajo += 1;
    if (estado === 'agotado') resumen.agotados += 1;
  }
  return resumen;
}

// RF-17: activos primero y luego por nombre (orden alfabético chileno). No muta la entrada.
export function ordenarProductos(productos) {
  return [...productos].sort((a, b) => {
    const diferenciaActivo = Number(Boolean(b.activo)) - Number(Boolean(a.activo));
    if (diferenciaActivo !== 0) return diferenciaActivo;
    return String(a.nombre).localeCompare(String(b.nombre), 'es-CL');
  });
}
