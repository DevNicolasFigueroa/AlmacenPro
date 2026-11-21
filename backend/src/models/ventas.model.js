// Modelo de ventas: ciclo de la venta en curso (spec 001) y su carrito (spec 003).
// Toda escritura relacionada con la sesión se hace en transacción para no dejar
// una venta cancelada sin invalidar sus tokens, ni una sesión cerrada con venta abierta.
import { pool } from '../config/db.js';
import { redondearCantidad } from '../utils/inventario.js';
import {
  calcularSubtotal,
  calcularTotal,
  evaluarStockAlAgregar,
  validarCantidadLinea,
} from '../utils/ventas.js';

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

// Al terminar la venta, un cajero desactivado pierde el acceso en ese mismo momento (RF-15).
export async function finalizar(ventaId) {
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
      `UPDATE ventas SET estado = 'completada' WHERE id = ?`,
      [ventaId]
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

// RF-28: historial de ventas canceladas automáticamente con su cajero.
export async function listarCanceladasAutomaticamente() {
  const [filas] = await pool.query(`
    SELECT v.id, v.fecha, v.iniciada_en, v.ultima_actividad, v.cancelada_en, v.total,
           u.id AS usuario_id, u.nombre AS cajero_nombre, u.usuario AS cajero_usuario
    FROM ventas v
    INNER JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.estado = 'cancelada_automaticamente'
    ORDER BY v.cancelada_en DESC
  `);
  return filas;
}
