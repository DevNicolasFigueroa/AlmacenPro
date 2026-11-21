// Funciones puras de decisión del módulo de ventas (spec 003).
// Ninguna lee reloj, base de datos ni red: la fecha llega en "hoy" como parámetro.
import { cantidadValidaParaUnidad, redondearCantidad } from './inventario.js';

export const METODOS_PAGO = ['efectivo', 'debito', 'credito', 'fiado'];
export const LONGITUD_MAXIMA_MOTIVO = 255;

function comoNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor === 'string' && /^\d+(\.\d+)?$/.test(valor.trim())) return Number(valor.trim());
  return NaN;
}

// Monto en pesos chilenos con separador de miles: 1490 -> "$1.490".
export function formatearPesos(valor) {
  const entero = Math.round(Number(valor));
  const texto = String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${entero < 0 ? '-' : ''}$${texto}`;
}

// Cantidad para mensajes: kilos con coma decimal ("0,35 kg") y unidades enteras ("12 u.").
function formatearCantidadTexto(valor, unidad) {
  const numero = redondearCantidad(valor);
  if (unidad === 'kilo') return `${String(numero).replace('.', ',')} kg`;
  return `${numero} u.`;
}

// RF-11: precio por cantidad, redondeado al peso entero más cercano (medio peso hacia arriba).
// Se calcula con enteros (milésimas) y BigInt: ni errores de coma flotante ni desbordes.
export function calcularSubtotal(precio, cantidad) {
  const milesimas = BigInt(Math.round(Number(cantidad) * 1000));
  const pesos = BigInt(Math.round(Number(precio)));
  return Number((pesos * milesimas + 500n) / 1000n);
}

// RF-11, RF-12: el total es la suma de los subtotales ya redondeados de cada línea,
// no el redondeo de la suma. Cada línea trae precio_unitario (congelado) y cantidad.
export function calcularTotal(lineas) {
  return lineas.reduce(
    (suma, linea) => suma + calcularSubtotal(linea.precio_unitario, linea.cantidad),
    0
  );
}

// RF-4, RF-13: cantidad mayor que 0 (entera por unidad, hasta 3 decimales por kilo) y
// con un subtotal que no se redondee a $0.
// Devuelve { ok: true, cantidad } o { ok: false, codigo, mensaje }.
export function validarCantidadLinea({ cantidad, unidad, precio }) {
  const formato = unidad === 'kilo'
    ? 'un número mayor a 0, con hasta 3 decimales'
    : 'un número entero mayor a 0';

  if (!cantidadValidaParaUnidad(cantidad, unidad)) {
    return { ok: false, codigo: 'CANTIDAD_INVALIDA', mensaje: `La cantidad debe ser ${formato}` };
  }

  const valor = redondearCantidad(comoNumero(cantidad));
  if (valor <= 0) {
    return { ok: false, codigo: 'CANTIDAD_INVALIDA', mensaje: `La cantidad debe ser ${formato}` };
  }

  if (calcularSubtotal(precio, valor) === 0) {
    return {
      ok: false,
      codigo: 'SUBTOTAL_CERO',
      mensaje: 'La cantidad es tan pequeña que el subtotal sería $0: ingresa una cantidad mayor',
    };
  }

  return { ok: true, cantidad: valor };
}

// RF-7, RF-8: al agregar se revisa que el producto esté disponible y que alcance el stock
// sumando lo que ya hay en el carrito. El stock no se reserva: solo se avisa.
// Devuelve { ok: true, cantidadTotal } o { ok: false, codigo, mensaje, stockDisponible }.
export function evaluarStockAlAgregar({
  stock, enCarrito = 0, pedida, activo, unidad = 'unidad', nombre = 'este producto',
}) {
  const disponible = redondearCantidad(stock);

  if (!activo) {
    return {
      ok: false,
      codigo: 'PRODUCTO_DESACTIVADO',
      mensaje: `«${nombre}» no está disponible para la venta`,
      stockDisponible: disponible,
    };
  }
  if (disponible <= 0) {
    return {
      ok: false,
      codigo: 'AGOTADO',
      mensaje: `«${nombre}» está agotado`,
      stockDisponible: disponible,
    };
  }

  const cantidadTotal = redondearCantidad(Number(enCarrito) + Number(pedida));
  if (cantidadTotal > disponible) {
    return {
      ok: false,
      codigo: 'STOCK_INSUFICIENTE',
      mensaje: `Solo quedan ${formatearCantidadTexto(disponible, unidad)} de «${nombre}»`,
      stockDisponible: disponible,
    };
  }

  return { ok: true, cantidadTotal };
}

// RF-26, RF-27, RF-30: al confirmar se revisa todo el carrito y se informan TODOS los
// problemas juntos, para corregirlos de una vez. Las líneas traen producto_id y cantidad;
// los productos (ya bloqueados) traen id, nombre, stock, unidad_medida y activo.
// Devuelve { ok: true } o { ok: false, codigo, problemas }.
export function verificarCarritoParaConfirmar(lineas, productos) {
  if (lineas.length === 0) {
    return {
      ok: false,
      codigo: 'CARRITO_VACIO',
      problemas: [{ codigo: 'CARRITO_VACIO', mensaje: 'Agrega al menos un producto para confirmar la venta' }],
    };
  }

  const porId = new Map(productos.map((producto) => [producto.id, producto]));
  const problemas = [];

  for (const linea of lineas) {
    const producto = porId.get(linea.producto_id);
    if (!producto || !producto.activo) {
      problemas.push({
        codigo: 'PRODUCTO_DESACTIVADO',
        productoId: linea.producto_id,
        nombre: producto?.nombre ?? null,
        mensaje: `«${producto?.nombre ?? 'Producto'}» fue desactivado: quítalo de la venta`,
      });
      continue;
    }

    const disponible = redondearCantidad(producto.stock);
    if (redondearCantidad(linea.cantidad) > disponible) {
      problemas.push({
        codigo: 'STOCK_INSUFICIENTE',
        productoId: producto.id,
        nombre: producto.nombre,
        stockDisponible: disponible,
        mensaje: `Solo quedan ${formatearCantidadTexto(disponible, producto.unidad_medida)} de «${producto.nombre}»`,
      });
    }
  }

  if (problemas.length === 0) return { ok: true };

  const hayDesactivados = problemas.some((problema) => problema.codigo === 'PRODUCTO_DESACTIVADO');
  return {
    ok: false,
    codigo: hayDesactivados ? 'PRODUCTO_DESACTIVADO' : 'STOCK_INSUFICIENTE',
    problemas,
  };
}

// RF-15: diferencia entre lo recibido y el total. Solo se muestra, no se guarda.
export function calcularVuelto(total, recibido) {
  const diferencia = Math.round(Number(recibido)) - Math.round(Number(total));
  return { vuelto: Math.max(0, diferencia), faltan: Math.max(0, -diferencia) };
}

// RF-14–17: un único método de pago; en efectivo el monto recibido alcanza el total;
// el fiado exige un cliente. Devuelve { ok: true, vuelto } (vuelto nulo si no es efectivo)
// o { ok: false, codigo, mensaje }.
export function validarCobro({ metodoPago, total, montoRecibido, clienteId }) {
  if (!METODOS_PAGO.includes(metodoPago)) {
    return {
      ok: false,
      codigo: 'METODO_INVALIDO',
      mensaje: 'Elige el método de pago: efectivo, débito, crédito o fiado',
    };
  }

  if (metodoPago === 'efectivo') {
    const recibido = comoNumero(montoRecibido);
    if (!Number.isInteger(recibido)) {
      return {
        ok: false,
        codigo: 'MONTO_INVALIDO',
        mensaje: 'Ingresa el monto recibido en pesos, sin decimales',
      };
    }
    const { vuelto, faltan } = calcularVuelto(total, recibido);
    if (faltan > 0) {
      return {
        ok: false,
        codigo: 'MONTO_INSUFICIENTE',
        mensaje: `El monto recibido no alcanza: faltan ${formatearPesos(faltan)}`,
        faltan,
      };
    }
    return { ok: true, vuelto };
  }

  if (metodoPago === 'fiado') {
    const id = Number(clienteId);
    if (!Number.isInteger(id) || id <= 0) {
      return {
        ok: false,
        codigo: 'FIADO_SIN_CLIENTE',
        mensaje: 'Para vender al fiado debes identificar al cliente con su RUT',
      };
    }
  }

  return { ok: true, vuelto: null };
}

// RF-42, RF-45: solo se anula una venta completada.
// Devuelve { ok: true } o { ok: false, codigo, mensaje }.
export function puedeAnular(venta) {
  const estado = venta?.estado;
  if (estado === 'completada') return { ok: true };
  if (estado === 'anulada') {
    return { ok: false, codigo: 'YA_ANULADA', mensaje: 'La venta ya está anulada' };
  }
  if (estado === 'en_curso') {
    return {
      ok: false,
      codigo: 'NO_CONFIRMADA',
      mensaje: 'La venta aún no está confirmada: cancélala en lugar de anularla',
    };
  }
  return {
    ok: false,
    codigo: 'NO_CONFIRMADA',
    mensaje: 'Una venta cancelada nunca se concretó, por eso no se puede anular',
  };
}

// RF-42: el motivo es obligatorio, se recorta y admite hasta 255 caracteres.
export function normalizarMotivo(texto) {
  const motivo = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (motivo === '') {
    return { ok: false, mensaje: 'Escribe el motivo de la anulación' };
  }
  if (motivo.length > LONGITUD_MAXIMA_MOTIVO) {
    return { ok: false, mensaje: `El motivo admite hasta ${LONGITUD_MAXIMA_MOTIVO} caracteres` };
  }
  return { ok: true, motivo };
}

function aTexto(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

// Interpreta 'AAAA-MM-DD' como día real del calendario; si no existe, devuelve null.
function leerDia(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? '').trim());
  if (!partes) return null;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(anio, mes - 1, dia);
  const coincide = fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
  return coincide ? fecha : null;
}

const estaVacio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

// RF-36: un día o un rango "desde - hasta"; sin datos, el día de hoy. Devuelve el rango
// como [inicio, fin) en hora local para filtrar con ">= inicio" y "< fin".
// Devuelve { ok: true, desde, hasta, inicio, fin } o { ok: false, mensaje }.
export function rangoDeFechas({ desde, hasta } = {}, hoy) {
  const hayDesde = !estaVacio(desde);
  const hayHasta = !estaVacio(hasta);

  const diaDesde = hayDesde ? leerDia(desde) : null;
  const diaHasta = hayHasta ? leerDia(hasta) : null;
  if ((hayDesde && !diaDesde) || (hayHasta && !diaHasta)) {
    return { ok: false, mensaje: 'Las fechas deben tener el formato AAAA-MM-DD' };
  }

  const dia = (valor) => new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  const primero = diaDesde ?? diaHasta ?? dia(hoy);
  const ultimo = diaHasta ?? diaDesde ?? dia(hoy);

  if (primero.getTime() > ultimo.getTime()) {
    return { ok: false, mensaje: 'La fecha "desde" no puede ser posterior a la fecha "hasta"' };
  }

  const siguiente = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 1);
  return {
    ok: true,
    desde: aTexto(primero),
    hasta: aTexto(ultimo),
    inicio: `${aTexto(primero)} 00:00:00`,
    fin: `${aTexto(siguiente)} 00:00:00`,
  };
}

// RF-37, RF-48: recibe lo que entrega el GROUP BY ({ estado, cantidad, total }) y devuelve
// el resumen. Solo las completadas suman su total; anuladas y canceladas solo se cuentan.
export function armarResumenHistorial(grupos) {
  const resumen = {
    completadas: { cantidad: 0, total: 0 },
    anuladas: { cantidad: 0 },
    canceladas: { cantidad: 0 },
  };

  for (const grupo of grupos) {
    const cantidad = Number(grupo.cantidad ?? 0);
    if (grupo.estado === 'completada') {
      resumen.completadas.cantidad += cantidad;
      resumen.completadas.total += Number(grupo.total ?? 0);
    } else if (grupo.estado === 'anulada') {
      resumen.anuladas.cantidad += cantidad;
    } else if (grupo.estado === 'cancelada' || grupo.estado === 'cancelada_automaticamente') {
      resumen.canceladas.cantidad += cantidad;
    }
  }

  return resumen;
}

// RF-18, RF-44: deuda si el cliente debe, a favor si pagó de más, al día si está en cero.
export function estadoCuenta(saldo) {
  const valor = Math.round(Number(saldo ?? 0));
  if (valor > 0) return 'deuda';
  if (valor < 0) return 'a_favor';
  return 'al_dia';
}
