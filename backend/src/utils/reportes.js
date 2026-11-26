// Funciones puras de los reportes (spec 005).
// Ninguna lee reloj, base de datos ni red: las consultas entregan filas y aquí se arman las cifras.
import { estadoStock } from './inventario.js';
import { rangoDeFechas } from './ventas.js';

export const MAXIMO_DIAS_REPORTE = 366;

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const METODOS_VENTA = ['efectivo', 'debito', 'credito', 'fiado'];
const METODOS_COBRADOS = ['efectivo', 'debito', 'credito'];
const METODOS_ABONO = ['efectivo', 'debito', 'credito', 'transferencia'];

function aEntero(valor) {
  return Math.round(Number(valor ?? 0));
}

// RF-8: el período de un reporte: fechas completas, "desde" no posterior a "hasta" (lo valida
// rangoDeFechas) y de hasta un año. Sin fechas, es hoy. Devuelve { ok, desde, hasta, inicio, fin }
// o { ok: false, mensaje } con lo que hay que corregir.
export function rangoDeReporte({ desde, hasta } = {}, hoy) {
  const rango = rangoDeFechas({ desde, hasta }, hoy);
  if (!rango.ok) return rango;

  const dias = Math.round(
    (new Date(`${rango.hasta}T00:00:00`) - new Date(`${rango.desde}T00:00:00`)) / MS_POR_DIA
  ) + 1;
  if (dias > MAXIMO_DIAS_REPORTE) {
    return { ok: false, mensaje: 'El período puede ser de hasta un año (366 días): acorta las fechas' };
  }
  return rango;
}

// RF-4, RF-6: recibe lo que entrega el GROUP BY ({ estado, metodo_pago, cantidad, total }).
// Solo las completadas suman al vendido; las anuladas se cuentan con su monto y las canceladas
// solo se cuentan. Un período sin ventas queda en cero.
export function armarResumenVentas(grupos) {
  const porMetodo = Object.fromEntries(METODOS_VENTA.map((metodo) => [metodo, { cantidad: 0, total: 0 }]));
  const resumen = {
    vendido: 0,
    cantidad: 0,
    promedio: 0,
    por_metodo: porMetodo,
    anuladas: { cantidad: 0, total: 0 },
    canceladas: { cantidad: 0 },
  };

  for (const grupo of grupos) {
    const cantidad = aEntero(grupo.cantidad);
    const total = aEntero(grupo.total);
    if (grupo.estado === 'completada') {
      resumen.vendido += total;
      resumen.cantidad += cantidad;
      if (porMetodo[grupo.metodo_pago]) {
        porMetodo[grupo.metodo_pago].cantidad += cantidad;
        porMetodo[grupo.metodo_pago].total += total;
      }
    } else if (grupo.estado === 'anulada') {
      resumen.anuladas.cantidad += cantidad;
      resumen.anuladas.total += total;
    } else if (grupo.estado === 'cancelada' || grupo.estado === 'cancelada_automaticamente') {
      resumen.canceladas.cantidad += cantidad;
    }
  }

  resumen.promedio = resumen.cantidad > 0 ? Math.round(resumen.vendido / resumen.cantidad) : 0;
  return resumen;
}

// RF-7: lo cobrado es lo que efectivamente entró: ventas en efectivo, débito y crédito más los
// abonos. Una venta al fiado no es cobrado hasta que se abona. Recibe el desglose de
// armarResumenVentas y las filas de abonos ({ metodo_pago, total }); un abono antiguo sin método
// se informa como "sin_metodo" y también suma.
export function armarCobrado({ porMetodo, abonos }) {
  const ventas = Object.fromEntries(METODOS_COBRADOS.map((metodo) => [metodo, aEntero(porMetodo?.[metodo]?.total)]));
  const abonosPorMetodo = Object.fromEntries(METODOS_ABONO.map((metodo) => [metodo, 0]));
  let sinMetodo = 0;
  for (const fila of abonos) {
    const total = aEntero(fila.total);
    if (METODOS_ABONO.includes(fila.metodo_pago)) abonosPorMetodo[fila.metodo_pago] += total;
    else sinMetodo += total;
  }

  const totalVentas = METODOS_COBRADOS.reduce((suma, metodo) => suma + ventas[metodo], 0);
  const totalAbonos = Object.values(abonosPorMetodo).reduce((suma, valor) => suma + valor, 0) + sinMetodo;
  return {
    ventas,
    abonos: { ...abonosPorMetodo, ...(sinMetodo > 0 && { sin_metodo: sinMetodo }) },
    total_ventas: totalVentas,
    total_abonos: totalAbonos,
    total: totalVentas + totalAbonos,
    vendido_al_fiado: aEntero(porMetodo?.fiado?.total),
  };
}

// RF-10: ganancia (vendido menos costo) y margen en porcentaje entero. Sin ventas, margen 0.
export function calcularMargen(vendido, costo) {
  const ganancia = aEntero(vendido) - aEntero(costo);
  const margen = aEntero(vendido) > 0 ? Math.round((ganancia / aEntero(vendido)) * 100) : 0;
  return { ganancia, margen };
}

// RF-11, RF-13: ganancia por producto, de mayor a menor (y por nombre si empatan). Cada fila
// trae { producto_id, nombre, unidad_medida, cantidad, vendido, costo, con_costo_cero }.
// Se marca costo_cero cuando alguna línea vendida tenía costo $0: la ganancia puede estar sobrestimada.
export function armarGananciasPorProducto(filas) {
  return filas
    .map((fila) => ({
      producto_id: fila.producto_id,
      nombre: fila.nombre,
      unidad_medida: fila.unidad_medida,
      cantidad: Number(fila.cantidad),
      vendido: aEntero(fila.vendido),
      costo: aEntero(fila.costo),
      ...calcularMargen(fila.vendido, fila.costo),
      costo_cero: Boolean(Number(fila.con_costo_cero ?? 0)),
    }))
    .sort((a, b) => b.ganancia - a.ganancia || String(a.nombre).localeCompare(String(b.nombre), 'es-CL'));
}

// RF-15: productos por reponer: solo los activos agotados o con stock bajo (la misma regla de
// estadoStock de la spec 002), primero los agotados y luego los de stock bajo, ambos por stock
// ascendente y nombre. No muta la entrada.
export function ordenarPorReponer(productos) {
  const rango = { agotado: 0, bajo: 1 };
  return productos
    .map((producto) => ({
      ...producto,
      estado: estadoStock({ stock: producto.stock, stockMinimo: producto.stock_minimo, activo: producto.activo }),
    }))
    .filter((producto) => producto.estado in rango)
    .sort((a, b) => rango[a.estado] - rango[b.estado]
      || Number(a.stock) - Number(b.stock)
      || String(a.nombre).localeCompare(String(b.nombre), 'es-CL'));
}
