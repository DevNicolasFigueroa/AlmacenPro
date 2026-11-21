// Modelo de ventas: ciclo de la venta en curso (spec 001) y su carrito (spec 003).
// Toda escritura relacionada con la sesión se hace en transacción para no dejar
// una venta cancelada sin invalidar sus tokens, ni una sesión cerrada con venta abierta.
import { pool } from '../config/db.js';
import { armarMovimiento, redondearCantidad } from '../utils/inventario.js';
import {
  armarResumenHistorial,
  calcularSubtotal,
  calcularTotal,
  evaluarStockAlAgregar,
  puedeAnular,
  validarCantidadLinea,
  validarCobro,
  verificarCarritoParaConfirmar,
} from '../utils/ventas.js';
import * as clientesModelo from './clientes.model.js';
import * as fiadoModelo from './fiadoTransacciones.model.js';
import * as movimientosStock from './movimientosStock.model.js';
import * as productosModelo from './productos.model.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

export async function buscarEnCursoPorUsuario(usuarioId) {
  const [filas] = await pool.query(
    `SELECT id, usuario_id, estado, iniciada_en, ultima_actividad, total
     FROM ventas
     WHERE usuario_id = :usuarioId AND estado = 'en_curso'
     ORDER BY id DESC
     LIMIT 1`,
    { usuarioId }
  );
  return filas[0] ? { ...filas[0], total: aNumero(filas[0].total) } : null;
}

// RF-30: última venta confirmada de la persona. Sirve para mostrar su estado real si se cortó
// la conexión justo al confirmar y no se llegó a ver el resumen. Sin costos ni datos de gestión.
export async function buscarUltimaConfirmada(usuarioId) {
  const [filas] = await pool.query(
    `SELECT id, fecha, total, metodo_pago
     FROM ventas
     WHERE usuario_id = :usuarioId AND estado = 'completada'
     ORDER BY fecha DESC, id DESC
     LIMIT 1`,
    { usuarioId }
  );
  return filas[0] ? { ...filas[0], total: aNumero(filas[0].total) } : null;
}

// ---------------------------------------------------------------------------
// Carrito de la venta en curso (spec 003, RF-1–13)
// Las líneas viven en detalle_ventas de la venta en curso: al confirmar ya están guardadas
// y al cancelar quedan como seguimiento, sin tocar stock ni deuda (RF-10).
// ---------------------------------------------------------------------------

function convertirLinea(fila) {
  return {
    ...fila,
    cantidad: aNumero(fila.cantidad),
    precio_unitario: aNumero(fila.precio_unitario),
    subtotal: aNumero(fila.subtotal),
    stock: aNumero(fila.stock),
  };
}

// RF-12: líneas con su precio congelado y subtotal, y el total (suma de líneas ya redondeadas).
// Trae el stock actual del producto para avisar en pantalla; nunca el costo (RNF-9).
export async function obtenerCarrito(ventaId, conexion = pool) {
  const [filas] = await conexion.query(
    `SELECT d.producto_id, p.nombre, p.codigo_barras, p.unidad_medida, p.stock, p.activo,
            d.cantidad, d.precio_unitario, d.subtotal
     FROM detalle_ventas d
     JOIN productos p ON p.id = d.producto_id
     WHERE d.venta_id = :ventaId
     ORDER BY d.id`,
    { ventaId }
  );
  const lineas = filas.map(convertirLinea);
  return { lineas, total: calcularTotal(lineas) };
}

async function guardarTotalYActividad(conexion, ventaId, hoy) {
  const [filas] = await conexion.query(
    'SELECT cantidad, precio_unitario FROM detalle_ventas WHERE venta_id = :ventaId',
    { ventaId }
  );
  const total = calcularTotal(filas.map((fila) => ({
    cantidad: aNumero(fila.cantidad),
    precio_unitario: aNumero(fila.precio_unitario),
  })));
  // RF-9: cada cambio del carrito cuenta como actividad de la venta.
  await conexion.query(
    'UPDATE ventas SET total = :total, ultima_actividad = :hoy WHERE id = :ventaId',
    { total, hoy, ventaId }
  );
}

// Ejecuta un cambio del carrito en una transacción que bloquea la fila de la venta: dos cambios
// simultáneos del mismo carrito se aplican uno tras otro. "trabajo" devuelve { ok: true } para
// guardar (se recalcula el total y la actividad) o { ok: false, ... } para no cambiar nada.
async function ejecutarEnCarrito(ventaId, hoy, trabajo) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [ventas] = await conexion.query(
      'SELECT id, estado FROM ventas WHERE id = :ventaId FOR UPDATE',
      { ventaId }
    );
    if (ventas.length === 0 || ventas[0].estado !== 'en_curso') {
      await conexion.rollback();
      return { ok: false, codigo: 'VENTA_NO_EN_CURSO', mensaje: 'La venta ya no está en curso' };
    }

    const resultado = await trabajo(conexion);
    if (!resultado.ok) {
      await conexion.rollback();
      return resultado;
    }

    await guardarTotalYActividad(conexion, ventaId, hoy);
    const carrito = await obtenerCarrito(ventaId, conexion);
    await conexion.commit();
    return { ok: true, ...carrito };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function leerProducto(conexion, productoId) {
  const [filas] = await conexion.query(
    `SELECT id, nombre, precio_venta, stock, unidad_medida, activo
     FROM productos WHERE id = :productoId`,
    { productoId }
  );
  if (filas.length === 0) return null;
  return {
    ...filas[0],
    precio_venta: aNumero(filas[0].precio_venta),
    stock: aNumero(filas[0].stock),
  };
}

async function leerLinea(conexion, ventaId, productoId) {
  const [filas] = await conexion.query(
    `SELECT producto_id, cantidad, precio_unitario
     FROM detalle_ventas WHERE venta_id = :ventaId AND producto_id = :productoId`,
    { ventaId, productoId }
  );
  if (filas.length === 0) return null;
  return {
    ...filas[0],
    cantidad: aNumero(filas[0].cantidad),
    precio_unitario: aNumero(filas[0].precio_unitario),
  };
}

const PRODUCTO_NO_ENCONTRADO = {
  ok: false,
  codigo: 'PRODUCTO_NO_ENCONTRADO',
  mensaje: 'No se encontró el producto',
};

// Valida la cantidad pedida y deja la línea con "cantidadFinal" (suma o fija). Comparte la regla
// entre agregar y cambiar: precio congelado, stock disponible y subtotal.
async function guardarLinea(conexion, { ventaId, producto, linea, cantidadFinal }) {
  const precio = linea ? linea.precio_unitario : producto.precio_venta; // RF-3, RF-5
  const subtotal = calcularSubtotal(precio, cantidadFinal);

  if (linea) {
    await conexion.query(
      `UPDATE detalle_ventas SET cantidad = :cantidad, subtotal = :subtotal
       WHERE venta_id = :ventaId AND producto_id = :productoId`,
      { cantidad: cantidadFinal, subtotal, ventaId, productoId: producto.id }
    );
  } else {
    await conexion.query(
      `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES (:ventaId, :productoId, :cantidad, :precio, :subtotal)`,
      { ventaId, productoId: producto.id, cantidad: cantidadFinal, precio, subtotal }
    );
  }
}

// RF-3, RF-5, RF-7, RF-8, RF-13: agrega un producto al carrito. Si ya estaba, suma la cantidad
// en la misma línea y conserva el precio con que se agregó. El stock no se reserva: solo se
// revisa que alcance. Devuelve { ok: true, lineas, total } o { ok: false, codigo, mensaje }.
export function agregarLinea({ ventaId, productoId, cantidad, hoy }) {
  return ejecutarEnCarrito(ventaId, hoy, async (conexion) => {
    const producto = await leerProducto(conexion, productoId);
    if (!producto) return PRODUCTO_NO_ENCONTRADO;

    const linea = await leerLinea(conexion, ventaId, productoId);
    const precio = linea ? linea.precio_unitario : producto.precio_venta;

    const valida = validarCantidadLinea({ cantidad, unidad: producto.unidad_medida, precio });
    if (!valida.ok) return valida;

    const stock = evaluarStockAlAgregar({
      stock: producto.stock,
      enCarrito: linea?.cantidad ?? 0,
      pedida: valida.cantidad,
      activo: producto.activo,
      unidad: producto.unidad_medida,
      nombre: producto.nombre,
    });
    if (!stock.ok) return stock;

    await guardarLinea(conexion, { ventaId, producto, linea, cantidadFinal: stock.cantidadTotal });
    return { ok: true };
  });
}

// RF-6, RF-7: fija la cantidad de una línea. Bajar la cantidad siempre se permite; subirla
// pide que el producto siga activo y que alcance el stock.
export function cambiarCantidad({ ventaId, productoId, cantidad, hoy }) {
  return ejecutarEnCarrito(ventaId, hoy, async (conexion) => {
    const linea = await leerLinea(conexion, ventaId, productoId);
    if (!linea) {
      return { ok: false, codigo: 'LINEA_NO_ENCONTRADA', mensaje: 'Ese producto no está en el carrito' };
    }
    const producto = await leerProducto(conexion, productoId);

    const valida = validarCantidadLinea({
      cantidad, unidad: producto.unidad_medida, precio: linea.precio_unitario,
    });
    if (!valida.ok) return valida;

    if (redondearCantidad(valida.cantidad) > redondearCantidad(linea.cantidad)) {
      const stock = evaluarStockAlAgregar({
        stock: producto.stock,
        enCarrito: 0,
        pedida: valida.cantidad,
        activo: producto.activo,
        unidad: producto.unidad_medida,
        nombre: producto.nombre,
      });
      if (!stock.ok) return stock;
    }

    await guardarLinea(conexion, { ventaId, producto, linea, cantidadFinal: valida.cantidad });
    return { ok: true };
  });
}

// RF-6: quita una línea del carrito.
export function quitarLinea({ ventaId, productoId, hoy }) {
  return ejecutarEnCarrito(ventaId, hoy, async (conexion) => {
    const [resultado] = await conexion.query(
      'DELETE FROM detalle_ventas WHERE venta_id = :ventaId AND producto_id = :productoId',
      { ventaId, productoId }
    );
    if (resultado.affectedRows === 0) {
      return { ok: false, codigo: 'LINEA_NO_ENCONTRADA', mensaje: 'Ese producto no está en el carrito' };
    }
    return { ok: true };
  });
}

// RF-6: vacía el carrito (la venta sigue en curso).
export function vaciarCarrito({ ventaId, hoy }) {
  return ejecutarEnCarrito(ventaId, hoy, async (conexion) => {
    await conexion.query('DELETE FROM detalle_ventas WHERE venta_id = :ventaId', { ventaId });
    return { ok: true };
  });
}

export async function buscarPorId(id) {
  const [filas] = await pool.query('SELECT * FROM ventas WHERE id = :id', { id });
  return filas[0] ?? null;
}

export async function listarEnCurso() {
  const [filas] = await pool.query(
    `SELECT id, usuario_id, ultima_actividad
     FROM ventas
     WHERE estado = 'en_curso'`
  );
  return filas;
}

// RF-23: como máximo una venta en curso por usuario. El bloqueo de la fila del
// usuario dentro de la transacción evita dos inicios simultáneos desde dos pestañas.
export async function iniciar(usuarioId, hoy) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [usuarios] = await conexion.query(
      'SELECT id FROM usuarios WHERE id = ? FOR UPDATE',
      [usuarioId]
    );
    if (usuarios.length === 0) {
      await conexion.rollback();
      return { error: 'No se encontró la cuenta indicada' };
    }

    const [existentes] = await conexion.query(
      `SELECT id FROM ventas WHERE usuario_id = ? AND estado = 'en_curso' LIMIT 1`,
      [usuarioId]
    );
    if (existentes.length > 0) {
      await conexion.rollback();
      return { conflicto: true };
    }

    const [resultado] = await conexion.query(
      `INSERT INTO ventas
         (usuario_id, fecha, total, metodo_pago, estado, iniciada_en, ultima_actividad)
       VALUES (?, ?, 0, 'efectivo', 'en_curso', ?, ?)`,
      [usuarioId, hoy, hoy, hoy]
    );

    await conexion.commit();
    return { id: resultado.insertId };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// ---------------------------------------------------------------------------
// Confirmar y anular (spec 003, RF-14–19, RF-25–34, RF-42–48)
// Ambas operaciones toman primero la fila de la venta y luego las de los productos en orden
// de id (bloquearPorIds): así dos ventas, una anulación y un ajuste manual que comparten
// productos se ejecutan uno tras otro y nunca se bloquean entre sí.
// ---------------------------------------------------------------------------

async function leerLineasDeVenta(conexion, ventaId) {
  const [filas] = await conexion.query(
    `SELECT producto_id, cantidad, precio_unitario, subtotal
     FROM detalle_ventas WHERE venta_id = :ventaId ORDER BY producto_id`,
    { ventaId }
  );
  return filas.map((fila) => ({
    producto_id: fila.producto_id,
    cantidad: aNumero(fila.cantidad),
    precio_unitario: aNumero(fila.precio_unitario),
    subtotal: aNumero(fila.subtotal),
  }));
}

async function bloquearVenta(conexion, ventaId) {
  const [filas] = await conexion.query(
    `SELECT id, usuario_id, cliente_id, estado, metodo_pago, total
     FROM ventas WHERE id = :ventaId FOR UPDATE`,
    { ventaId }
  );
  return filas[0] ? { ...filas[0], total: aNumero(filas[0].total) } : null;
}

const VENTA_NO_ENCONTRADA = {
  ok: false,
  codigo: 'VENTA_NO_ENCONTRADA',
  mensaje: 'No se encontró la venta indicada',
};

// RF-25: confirma la venta en UNA transacción todo o nada: venta completada, descuento de stock,
// movimiento de stock por línea y, si es fiado, el cargo al cliente. Cualquier falla deja todo
// como estaba y el carrito sigue en curso (RF-28). Devuelve:
//   { ok: true, venta, vuelto, saldo, productos }  o  { ok: false, codigo, mensaje, ... }.
// "usuarioId" es la cuenta que confirma; "hoy" el momento de la confirmación.
export async function confirmar({
  ventaId, usuarioId, metodoPago, clienteId = null, montoRecibido, hoy,
}) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const venta = await bloquearVenta(conexion, ventaId);
    if (!venta) {
      await conexion.rollback();
      return VENTA_NO_ENCONTRADA;
    }
    // RF-30: la segunda confirmación no registra nada y responde con el estado real.
    if (venta.estado === 'completada') {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'VENTA_YA_CONFIRMADA',
        mensaje: 'Esta venta ya está confirmada',
        venta: { id: venta.id, total: venta.total, metodo_pago: venta.metodo_pago },
      };
    }
    if (venta.estado !== 'en_curso') {
      await conexion.rollback();
      return { ok: false, codigo: 'VENTA_NO_EN_CURSO', mensaje: 'La venta ya no está en curso' };
    }

    const lineas = await leerLineasDeVenta(conexion, ventaId);
    const productos = await productosModelo.bloquearPorIds(
      conexion, lineas.map((linea) => linea.producto_id)
    );

    // RF-26, RF-27: se rechaza TODA la venta si algún producto no alcanza o fue desactivado.
    const revision = verificarCarritoParaConfirmar(lineas, productos);
    if (!revision.ok) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: revision.codigo,
        mensaje: revision.problemas[0].mensaje,
        problemas: revision.problemas,
      };
    }

    // El total se recalcula con las líneas guardadas: no se confía en el valor del carrito.
    const total = calcularTotal(lineas);
    const idCliente = clienteId === null || clienteId === undefined ? null : Number(clienteId);

    const cobro = validarCobro({ metodoPago, total, montoRecibido, clienteId: idCliente });
    if (!cobro.ok) {
      await conexion.rollback();
      return cobro;
    }

    let saldo = null;
    if (idCliente !== null) {
      if (!(await clientesModelo.buscarPorId(idCliente, conexion))) {
        await conexion.rollback();
        return { ok: false, codigo: 'CLIENTE_NO_ENCONTRADO', mensaje: 'No se encontró al cliente indicado' };
      }
    }

    const porId = new Map(productos.map((producto) => [producto.id, producto]));
    const stockActualizado = [];
    for (const linea of lineas) {
      const producto = porId.get(linea.producto_id);
      const stockDespues = redondearCantidad(producto.stock - linea.cantidad);

      await conexion.query(
        'UPDATE productos SET stock = :stockDespues WHERE id = :productoId',
        { stockDespues, productoId: producto.id }
      );
      await movimientosStock.insertar(conexion, armarMovimiento({
        productoId: producto.id,
        usuarioId,
        tipo: 'venta',
        stockAntes: producto.stock,
        stockDespues,
        nota: null,
        ventaId,
        hoy,
      }));
      stockActualizado.push({
        id: producto.id,
        nombre: producto.nombre,
        unidad_medida: producto.unidad_medida,
        stock: stockDespues,
        stock_minimo: producto.stock_minimo,
        activo: producto.activo,
      });
    }

    await conexion.query(
      `UPDATE ventas
       SET estado = 'completada', metodo_pago = :metodoPago, cliente_id = :clienteId,
           total = :total, fecha = :hoy, ultima_actividad = :hoy
       WHERE id = :ventaId`,
      { metodoPago, clienteId: idCliente, total, hoy, ventaId }
    );

    if (metodoPago === 'fiado') {
      await fiadoModelo.insertarCargo(conexion, {
        clienteId: idCliente, ventaId, usuarioId, monto: total, hoy,
      });
    }
    if (idCliente !== null) {
      saldo = await clientesModelo.obtenerSaldo(idCliente, conexion);
    }

    // Spec 001, RF-15: una cuenta desactivada pierde el acceso al terminar su venta.
    await conexion.query(
      'UPDATE usuarios SET token_version = token_version + 1 WHERE id = :usuarioDeVenta AND activo = 0',
      { usuarioDeVenta: venta.usuario_id }
    );

    await conexion.commit();
    return {
      ok: true,
      venta: { id: ventaId, total, metodo_pago: metodoPago, cliente_id: idCliente, fecha: hoy },
      vuelto: cobro.vuelto,
      saldo,
      productos: stockActualizado,
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// RF-42–48: anula una venta completada en UNA transacción: la venta queda anulada con quién,
// cuándo y por qué; el stock vuelve con un movimiento "anulacion_venta"; y si fue fiado, la
// anulación descuenta el cargo del saldo (puede quedar a favor del cliente, RF-44).
// El motivo llega ya normalizado. Devuelve { ok: true, saldo } o { ok: false, codigo, mensaje }.
export async function anular({ ventaId, usuarioId, motivo, hoy }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const venta = await bloquearVenta(conexion, ventaId);
    if (!venta) {
      await conexion.rollback();
      return VENTA_NO_ENCONTRADA;
    }
    const decision = puedeAnular(venta);
    if (!decision.ok) {
      await conexion.rollback();
      return decision;
    }

    const lineas = await leerLineasDeVenta(conexion, ventaId);
    // Se bloquean también los productos desactivados: el stock se devuelve igual.
    const productos = await productosModelo.bloquearPorIds(
      conexion, lineas.map((linea) => linea.producto_id)
    );
    const porId = new Map(productos.map((producto) => [producto.id, producto]));

    for (const linea of lineas) {
      const producto = porId.get(linea.producto_id);
      const stockDespues = redondearCantidad(producto.stock + linea.cantidad);

      await conexion.query(
        'UPDATE productos SET stock = :stockDespues WHERE id = :productoId',
        { stockDespues, productoId: producto.id }
      );
      await movimientosStock.insertar(conexion, armarMovimiento({
        productoId: producto.id,
        usuarioId,
        tipo: 'anulacion_venta',
        stockAntes: producto.stock,
        stockDespues,
        nota: motivo,
        ventaId,
        hoy,
      }));
    }

    let saldo = null;
    if (venta.metodo_pago === 'fiado' && venta.cliente_id) {
      await fiadoModelo.insertarAnulacion(conexion, {
        clienteId: venta.cliente_id, ventaId, usuarioId, monto: venta.total, hoy,
      });
      saldo = await clientesModelo.obtenerSaldo(venta.cliente_id, conexion);
    }

    // "fecha" no cambia: la venta anulada sigue contando en el día en que se vendió.
    await conexion.query(
      `UPDATE ventas
       SET estado = 'anulada', anulada_por = :usuarioId, anulada_en = :hoy,
           motivo_anulacion = :motivo
       WHERE id = :ventaId`,
      { usuarioId, hoy, motivo, ventaId }
    );

    await conexion.commit();
    return { ok: true, saldo };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// ---------------------------------------------------------------------------
// Historial y detalle (spec 003, RF-35–39)
// ---------------------------------------------------------------------------

// RF-35, RF-36: todas las ventas que ya no están en curso (completadas, anuladas y canceladas)
// con fecha de cierre en [inicio, fin), de la más reciente a la más antigua. "estados" es una
// lista opcional para filtrar. El método de pago solo tiene sentido si la venta se confirmó.
export async function listarHistorial({ inicio, fin, estados = [] }) {
  let filtroEstado = '';
  const parametros = { inicio, fin };
  if (estados.length > 0) {
    filtroEstado = 'AND v.estado IN (:estados)';
    parametros.estados = estados;
  }

  const [filas] = await pool.query(
    `SELECT v.id, v.fecha, v.total, v.estado, v.iniciada_en, v.ultima_actividad, v.cancelada_en,
            CASE WHEN v.estado IN ('completada', 'anulada') THEN v.metodo_pago END AS metodo_pago,
            u.id AS usuario_id, u.nombre AS cajero_nombre, u.usuario AS cajero_usuario,
            c.id AS cliente_id, c.rut AS cliente_rut, c.nombre AS cliente_nombre
     FROM ventas v
     JOIN usuarios u ON u.id = v.usuario_id
     LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE v.estado <> 'en_curso' AND v.fecha >= :inicio AND v.fecha < :fin ${filtroEstado}
     ORDER BY v.fecha DESC, v.id DESC`,
    parametros
  );
  return filas.map((fila) => ({ ...fila, total: aNumero(fila.total) }));
}

// RF-37: cantidades por estado y total de las completadas. Se calcula con el período completo,
// sin importar el filtro de estado de la tabla.
export async function resumenHistorial({ inicio, fin }) {
  const [grupos] = await pool.query(
    `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
     FROM ventas
     WHERE estado <> 'en_curso' AND fecha >= :inicio AND fecha < :fin
     GROUP BY estado`,
    { inicio, fin }
  );
  return armarResumenHistorial(grupos);
}

// RF-38, RF-39: venta con su carrito, cajero, cliente y datos de anulación o cancelación.
// Devuelve null si no existe. Nunca incluye costos.
export async function obtenerDetalle(ventaId) {
  const [filas] = await pool.query(
    `SELECT v.id, v.estado, v.fecha, v.iniciada_en, v.ultima_actividad, v.cancelada_en, v.total,
            CASE WHEN v.estado IN ('completada', 'anulada') THEN v.metodo_pago END AS metodo_pago,
            u.id AS usuario_id, u.nombre AS cajero_nombre, u.usuario AS cajero_usuario,
            c.id AS cliente_id, c.rut AS cliente_rut, c.nombre AS cliente_nombre,
            v.anulada_en, v.motivo_anulacion, a.nombre AS anulada_por_nombre
     FROM ventas v
     JOIN usuarios u ON u.id = v.usuario_id
     LEFT JOIN usuarios a ON a.id = v.anulada_por
     LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE v.id = :ventaId`,
    { ventaId }
  );
  if (filas.length === 0) return null;

  const [lineas] = await pool.query(
    `SELECT d.producto_id, p.nombre, p.unidad_medida, d.cantidad, d.precio_unitario, d.subtotal
     FROM detalle_ventas d
     JOIN productos p ON p.id = d.producto_id
     WHERE d.venta_id = :ventaId
     ORDER BY d.id`,
    { ventaId }
  );

  return {
    ...filas[0],
    total: aNumero(filas[0].total),
    lineas: lineas.map((linea) => ({
      ...linea,
      cantidad: aNumero(linea.cantidad),
      precio_unitario: aNumero(linea.precio_unitario),
      subtotal: aNumero(linea.subtotal),
    })),
  };
}

// La pertenencia de la venta se valida en el controlador según el rol.
export async function registrarActividad(ventaId, hoy) {
  const [resultado] = await pool.query(
    `UPDATE ventas
     SET ultima_actividad = ?
     WHERE id = ? AND estado = 'en_curso'`,
    [hoy, ventaId]
  );
  return resultado.affectedRows === 1;
}

// Cancelación manual (spec 003, RF-10): la venta queda "cancelada" con su carrito, sin tocar
// stock ni deuda, y "fecha" pasa a ser el momento de cierre. Si la cuenta está desactivada,
// pierde el acceso en la misma transacción (spec 001, RF-38, RNF-8).
export async function cancelar(ventaId, hoy) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [ventas] = await conexion.query(
      `SELECT id, usuario_id FROM ventas WHERE id = ? AND estado = 'en_curso' FOR UPDATE`,
      [ventaId]
    );
    if (ventas.length === 0) {
      await conexion.rollback();
      return { noEncontrada: true };
    }

    await conexion.query(
      `UPDATE ventas SET estado = 'cancelada', cancelada_en = ?, fecha = ? WHERE id = ?`,
      [hoy, hoy, ventaId]
    );
    await conexion.query(
      `UPDATE usuarios SET token_version = token_version + 1
       WHERE id = ? AND activo = 0`,
      [ventas[0].usuario_id]
    );

    await conexion.commit();
    return { ok: true };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// RF-25: cancelación automática y cierre de sesión en la MISMA transacción.
export async function cancelarAutomaticamente(venta, hoy) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [resultado] = await conexion.query(
      `UPDATE ventas
       SET estado = 'cancelada_automaticamente', cancelada_en = ?, fecha = ?
       WHERE id = ? AND estado = 'en_curso'`,
      [hoy, hoy, venta.id]
    );
    if (resultado.affectedRows === 1) {
      await conexion.query(
        'UPDATE usuarios SET token_version = token_version + 1 WHERE id = ?',
        [venta.usuario_id]
      );
    }

    await conexion.commit();
    return resultado.affectedRows === 1;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
