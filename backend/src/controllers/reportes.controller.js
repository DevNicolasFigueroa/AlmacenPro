// Controlador de los reportes (spec 005). Todos son exclusivos del administrador: lo exige el
// router, también por acceso directo. Aquí se valida el período y se arma la respuesta; las consultas
// están en el modelo y las cifras las arman las funciones puras de utils/reportes.js.
import * as reportesModelo from '../models/reportes.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import {
  armarCobrado,
  armarGananciasPorProducto,
  armarResumenVentas,
  calcularMargen,
  ordenarPorReponer,
  rangoDeReporte,
} from '../utils/reportes.js';

const LIMITE_MAS_VENDIDOS = 10;
const LIMITE_MAXIMO_MAS_VENDIDOS = 50;
const LIMITE_GANANCIAS_POR_PRODUCTO = 100;

// RF-8: período válido (hoy por defecto) o 400 con el mensaje que dice qué corregir.
function leerPeriodo(req) {
  const rango = rangoDeReporte({ desde: req.query.desde, hasta: req.query.hasta }, new Date());
  if (!rango.ok) throw new ErrorApi(400, rango.mensaje);
  return rango;
}

// RF-4 a RF-9: ventas del período con su desglose, lo anulado y cancelado aparte, y lo cobrado.
export async function ventas(req, res) {
  const rango = leerPeriodo(req);
  const [grupos, porCajero, porDia, abonos] = await Promise.all([
    reportesModelo.agruparVentas(rango),
    reportesModelo.ventasPorCajero(rango),
    reportesModelo.ventasPorDia(rango),
    reportesModelo.abonosCobrados(rango),
  ]);

  const resumen = armarResumenVentas(grupos);
  res.json({
    desde: rango.desde,
    hasta: rango.hasta,
    ...resumen,
    por_cajero: porCajero,
    por_dia: porDia,
    cobrado: armarCobrado({ porMetodo: resumen.por_metodo, abonos }),
  });
}

// RF-10 a RF-13: ganancia del período, por producto y con las ventas sin costo aparte.
export async function ganancias(req, res) {
  const rango = leerPeriodo(req);
  const [totales, porProducto, sinCosto] = await Promise.all([
    reportesModelo.totalesDeGanancia(rango),
    reportesModelo.gananciaPorProducto(rango),
    reportesModelo.ventasSinCosto(rango),
  ]);

  const productos = armarGananciasPorProducto(porProducto);
  res.json({
    desde: rango.desde,
    hasta: rango.hasta,
    vendido: totales.vendido,
    costo: totales.costo,
    ...calcularMargen(totales.vendido, totales.costo),
    productos: productos.slice(0, LIMITE_GANANCIAS_POR_PRODUCTO),
    total_productos: productos.length,
    productos_con_costo_cero: productos.filter((producto) => producto.costo_cero).length,
    sin_costo: sinCosto,
  });
}

// RF-14: más vendidos del período por monto (10 por defecto, hasta 50).
export async function masVendidos(req, res) {
  const rango = leerPeriodo(req);

  let limite = LIMITE_MAS_VENDIDOS;
  if (req.query.limite !== undefined && req.query.limite !== '') {
    limite = /^\d+$/.test(String(req.query.limite)) ? Number(req.query.limite) : NaN;
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO_MAS_VENDIDOS) {
      throw new ErrorApi(400, `El límite debe ser un número entero entre 1 y ${LIMITE_MAXIMO_MAS_VENDIDOS}`);
    }
  }

  const productos = await reportesModelo.masVendidos({ ...rango, limite });
  res.json({ desde: rango.desde, hasta: rango.hasta, limite, productos });
}

// RF-15: productos por reponer, primero los agotados y luego los de stock bajo.
export async function porReponer(req, res) {
  const productos = ordenarPorReponer(await reportesModelo.candidatosAReponer());
  res.json({
    productos,
    resumen: {
      agotados: productos.filter((producto) => producto.estado === 'agotado').length,
      stock_bajo: productos.filter((producto) => producto.estado === 'bajo').length,
    },
  });
}
