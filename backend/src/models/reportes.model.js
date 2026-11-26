// Consultas de los reportes (spec 005). Solo lectura: todo se calcula en cada consulta desde las
// ventas, los abonos y las anulaciones ya registradas; nada se guarda aparte (RF-29).
// Los períodos llegan como [inicio, fin) en texto 'AAAA-MM-DD HH:mm:ss' (ver rangoDeReporte).
import { pool } from '../config/db.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

// RF-4, RF-6: ventas del período por estado y método de pago. Solo las completadas suman; las
// anuladas siguen contando en el día en que se vendieron (ventas.fecha no cambia al anular).
export async function agruparVentas({ inicio, fin }) {
  const [filas] = await pool.query(
    `SELECT estado, metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
     FROM ventas
     WHERE estado <> 'en_curso' AND fecha >= :inicio AND fecha < :fin
     GROUP BY estado, metodo_pago`,
    { inicio, fin }
  );
  return filas;
}

// RF-5: lo vendido (completadas) por cajero, de mayor a menor.
export async function ventasPorCajero({ inicio, fin }) {
  const [filas] = await pool.query(
    `SELECT u.id AS usuario_id, u.nombre, COUNT(*) AS cantidad, SUM(v.total) AS total
     FROM ventas v
     JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.estado = 'completada' AND v.fecha >= :inicio AND v.fecha < :fin
     GROUP BY u.id, u.nombre
     ORDER BY total DESC, u.nombre`,
    { inicio, fin }
  );
  return filas.map((fila) => ({ ...fila, cantidad: Number(fila.cantidad), total: aNumero(fila.total) }));
}

// RF-5, RF-9: lo vendido (completadas) por día, en el día en que se confirmó cada venta.
export async function ventasPorDia({ inicio, fin }) {
  const [filas] = await pool.query(
    `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS dia, COUNT(*) AS cantidad, SUM(total) AS total
     FROM ventas
     WHERE estado = 'completada' AND fecha >= :inicio AND fecha < :fin
     GROUP BY dia
     ORDER BY dia`,
    { inicio, fin }
  );
  return filas.map((fila) => ({ ...fila, cantidad: Number(fila.cantidad), total: aNumero(fila.total) }));
}

// RF-7: lo cobrado por abonos en el período, por método. Un abono anulado no cuenta como cobrado.
export async function abonosCobrados({ inicio, fin }) {
  const [filas] = await pool.query(
    `SELECT t.metodo_pago, SUM(t.monto) AS total
     FROM fiado_transacciones t
     WHERE t.tipo = 'abono' AND t.fecha >= :inicio AND t.fecha < :fin
       AND NOT EXISTS (SELECT 1 FROM fiado_transacciones a WHERE a.abono_anulado_id = t.id)
     GROUP BY t.metodo_pago`,
    { inicio, fin }
  );
  return filas;
}

// Condición común de las ganancias: líneas de ventas completadas del período, de ventas que
// tienen su costo registrado en todas las líneas (el costo se guarda al confirmar, así que una
// venta tiene costo en todas sus líneas o en ninguna).
const VENTAS_CON_COSTO = `
  v.estado = 'completada' AND v.fecha >= :inicio AND v.fecha < :fin
  AND NOT EXISTS (SELECT 1 FROM detalle_ventas x WHERE x.venta_id = v.id AND x.costo_unitario IS NULL)`;

// RF-10: lo vendido y su costo, solo de las ventas con costo registrado. El costo de una línea es
// costo por cantidad redondeado al peso, la misma regla de calcularCostoLinea.
export async function totalesDeGanancia({ inicio, fin }) {
  const [[fila]] = await pool.query(
    `SELECT COALESCE(SUM(d.subtotal), 0) AS vendido,
            COALESCE(SUM(ROUND(d.costo_unitario * d.cantidad, 0)), 0) AS costo
     FROM detalle_ventas d
     JOIN ventas v ON v.id = d.venta_id
     WHERE ${VENTAS_CON_COSTO}`,
    { inicio, fin }
  );
  return { vendido: aNumero(fila.vendido), costo: aNumero(fila.costo) };
}

// RF-11, RF-13: lo mismo por producto, con la marca de si alguna línea vendida tenía costo $0.
export async function gananciaPorProducto({ inicio, fin }) {
  const [filas] = await pool.query(
    `SELECT p.id AS producto_id, p.nombre, p.unidad_medida,
            SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS vendido,
            SUM(ROUND(d.costo_unitario * d.cantidad, 0)) AS costo,
            MAX(d.costo_unitario = 0) AS con_costo_cero
     FROM detalle_ventas d
     JOIN ventas v ON v.id = d.venta_id
     JOIN productos p ON p.id = d.producto_id
     WHERE ${VENTAS_CON_COSTO}
     GROUP BY p.id, p.nombre, p.unidad_medida`,
    { inicio, fin }
  );
  return filas;
}

// RF-12: ventas completadas del período anteriores a este módulo, sin costo registrado. Se informan
// aparte y no entran a la ganancia.
export async function ventasSinCosto({ inicio, fin }) {
  const [[fila]] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(v.total), 0) AS total
     FROM ventas v
     WHERE v.estado = 'completada' AND v.fecha >= :inicio AND v.fecha < :fin
       AND EXISTS (SELECT 1 FROM detalle_ventas d WHERE d.venta_id = v.id AND d.costo_unitario IS NULL)`,
    { inicio, fin }
  );
  return { cantidad: Number(fila.cantidad), total: aNumero(fila.total) };
}

// RF-14: productos más vendidos del período, por monto vendido (hay productos por unidad y por kilo,
// así que ordenar por cantidad mezclaría unidades). Incluye los que después se desactivaron.
export async function masVendidos({ inicio, fin, limite }) {
  const [filas] = await pool.query(
    `SELECT p.id AS producto_id, p.nombre, p.unidad_medida, p.activo,
            SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS monto
     FROM detalle_ventas d
     JOIN ventas v ON v.id = d.venta_id
     JOIN productos p ON p.id = d.producto_id
     WHERE v.estado = 'completada' AND v.fecha >= :inicio AND v.fecha < :fin
     GROUP BY p.id, p.nombre, p.unidad_medida, p.activo
     ORDER BY monto DESC, p.nombre
     LIMIT :limite`,
    { inicio, fin, limite }
  );
  return filas.map((fila) => ({
    ...fila,
    activo: Boolean(fila.activo),
    cantidad: aNumero(fila.cantidad),
    monto: aNumero(fila.monto),
  }));
}

// RF-15: productos activos agotados o con stock bajo (la regla de estadoStock de la spec 002).
// El orden y la marca de estado los pone ordenarPorReponer.
export async function candidatosAReponer() {
  const [filas] = await pool.query(
    `SELECT id, nombre, unidad_medida, stock, stock_minimo, activo
     FROM productos
     WHERE activo = 1 AND (stock = 0 OR (stock_minimo > 0 AND stock <= stock_minimo))`
  );
  return filas.map((fila) => ({
    ...fila,
    stock: aNumero(fila.stock),
    stock_minimo: aNumero(fila.stock_minimo),
  }));
}
