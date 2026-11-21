// Modelo de productos: consultas SQL a la tabla "productos".
import { pool } from '../config/db.js';
import * as movimientosStock from './movimientosStock.model.js';
import { armarMovimiento, calcularAjuste } from '../utils/inventario.js';

// mysql2 entrega los DECIMAL como texto ("1490.00", "2.500"): se convierten a número
// antes de salir del modelo para que ninguna capa superior compare textos.
function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

function convertirNumeros(fila) {
  const resultado = {
    ...fila,
    precio_venta: aNumero(fila.precio_venta),
    stock: aNumero(fila.stock),
    stock_minimo: aNumero(fila.stock_minimo),
  };
  if ('precio_costo' in fila) resultado.precio_costo = aNumero(fila.precio_costo);
  return resultado;
}

// El costo solo se proyecta cuando el rol lo puede ver (RF-11, RF-12, RF-20, RNF-6):
// ocultarlo únicamente en la interfaz no basta, el dato viajaría en la respuesta.

// RF-17–19: incluye productos activos y desactivados, activos primero.
// El filtro por estado de stock lo aplica el controlador con estadoStock (una sola regla).
export async function listar({ textoBusqueda = '', categoriaId = null, incluirCosto = false } = {}) {
  let sql = `
    SELECT p.id, p.codigo_barras, p.nombre, p.descripcion,
           p.categoria_id, c.nombre AS categoria,
           ${incluirCosto ? 'p.precio_costo,' : ''}
           p.precio_venta, p.stock, p.stock_minimo,
           p.unidad_medida, p.activo
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE 1 = 1`;

  const parametros = {};

  if (textoBusqueda) {
    // Permite buscar por nombre o escanear un código de barras (RF-18)
    sql += ' AND (p.nombre LIKE :textoBusqueda OR p.codigo_barras = :codigo)';
    parametros.textoBusqueda = `%${textoBusqueda}%`;
    parametros.codigo = textoBusqueda;
  }

  if (categoriaId) {
    sql += ' AND p.categoria_id = :categoriaId';
    parametros.categoriaId = categoriaId;
  }

  sql += ' ORDER BY p.activo DESC, p.nombre';
  const [filas] = await pool.query(sql, parametros);
  return filas.map(convertirNumeros);
}

// Productos que se pueden vender: solo activos y sin costo (RF-13). La usará la spec de ventas.
export async function listarVendibles({ textoBusqueda = '' } = {}) {
  let sql = `
    SELECT p.id, p.codigo_barras, p.nombre, p.categoria_id, c.nombre AS categoria,
           p.precio_venta, p.stock, p.stock_minimo, p.unidad_medida, p.activo
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1`;
  const parametros = {};

  if (textoBusqueda) {
    sql += ' AND (p.nombre LIKE :textoBusqueda OR p.codigo_barras = :codigo)';
    parametros.textoBusqueda = `%${textoBusqueda}%`;
    parametros.codigo = textoBusqueda;
  }

  sql += ' ORDER BY p.nombre';
  const [filas] = await pool.query(sql, parametros);
  return filas.map(convertirNumeros);
}

export async function buscarPorId(id, { incluirCosto = false } = {}) {
  const [filas] = await pool.query(
    `SELECT p.id, p.codigo_barras, p.nombre, p.descripcion,
            p.categoria_id, c.nombre AS categoria,
            ${incluirCosto ? 'p.precio_costo,' : ''}
            p.precio_venta, p.stock, p.stock_minimo,
            p.unidad_medida, p.activo
     FROM productos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE p.id = :id`,
    { id }
  );
  return filas[0] ? convertirNumeros(filas[0]) : null;
}

// RF-5: busca entre activos y desactivados. "excluirId" permite editar sin chocar consigo mismo.
export async function buscarPorCodigoBarras(codigoBarras, { excluirId = null } = {}) {
  const [filas] = await pool.query(
    `SELECT id, nombre, activo
     FROM productos
     WHERE codigo_barras = :codigoBarras
       AND (:excluirId IS NULL OR id <> :excluirId)
     LIMIT 1`,
    { codigoBarras, excluirId }
  );
  return filas[0] ?? null;
}

// RF-6: sirve para avisar (sin bloquear) que ya existe un producto con el mismo nombre.
// La comparación no distingue mayúsculas ni tildes (collation utf8mb4_unicode_ci).
export async function existeNombre(nombre, { excluirId = null } = {}) {
  const [filas] = await pool.query(
    `SELECT 1 FROM productos
     WHERE nombre = :nombre
       AND (:excluirId IS NULL OR id <> :excluirId)
     LIMIT 1`,
    { nombre, excluirId }
  );
  return filas.length > 0;
}

// RF-1, RF-16, RF-18: categorías existentes para el formulario y el filtro.
export async function listarCategorias() {
  const [filas] = await pool.query('SELECT id, nombre FROM categorias ORDER BY nombre');
  return filas;
}

export async function existeCategoria(id) {
  const [filas] = await pool.query('SELECT 1 FROM categorias WHERE id = :id LIMIT 1', { id });
  return filas.length > 0;
}

// RF-33, RF-34: solo lo necesario para contar alertas de productos activos, sin costos.
export async function listarParaResumen() {
  const [filas] = await pool.query(
    'SELECT id, stock, stock_minimo, activo FROM productos WHERE activo = 1'
  );
  return filas.map((fila) => ({
    ...fila,
    stock: aNumero(fila.stock),
    stock_minimo: aNumero(fila.stock_minimo),
  }));
}

// RF-1, RF-8: crea el producto y, si trae stock inicial, su movimiento "stock inicial"
// en la misma transacción (todo o nada). "valores" es lo que devuelve validarDatosProducto.
export async function crear({ valores, usuarioId, hoy }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [resultado] = await conexion.query(
      `INSERT INTO productos
         (codigo_barras, nombre, categoria_id, precio_costo, precio_venta,
          stock, stock_minimo, unidad_medida)
       VALUES
         (:codigoBarras, :nombre, :categoriaId, :costo, :precioVenta,
          :stock, :stockMinimo, :unidad)`,
      {
        codigoBarras: valores.codigoBarras,
        nombre: valores.nombre,
        categoriaId: valores.categoriaId,
        costo: valores.costo,
        precioVenta: valores.precioVenta,
        stock: valores.stockInicial,
        stockMinimo: valores.stockMinimo,
        unidad: valores.unidad,
      }
    );
    const productoId = resultado.insertId;

    if (valores.stockInicial > 0) {
      await movimientosStock.insertar(conexion, armarMovimiento({
        productoId,
        usuarioId,
        tipo: 'stock_inicial',
        stockAntes: 0,
        stockDespues: valores.stockInicial,
        nota: null,
        hoy,
      }));
    }

    await conexion.commit();
    return productoId;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// RF-9, RF-10: lista blanca de campos editables. "stock" y "activo" no se tocan aquí:
// el stock solo cambia por ajuste, venta o anulación, y el estado por cambiarEstado.
// El precio nuevo solo rige hacia adelante: detalle_ventas conserva el suyo (RF-11).
export async function actualizar(id, valores) {
  const [resultado] = await pool.query(
    `UPDATE productos
     SET nombre = :nombre,
         codigo_barras = :codigoBarras,
         categoria_id = :categoriaId,
         unidad_medida = :unidad,
         precio_venta = :precioVenta,
         precio_costo = :costo,
         stock_minimo = :stockMinimo
     WHERE id = :id`,
    {
      id,
      nombre: valores.nombre,
      codigoBarras: valores.codigoBarras,
      categoriaId: valores.categoriaId,
      unidad: valores.unidad,
      precioVenta: valores.precioVenta,
      costo: valores.costo,
      stockMinimo: valores.stockMinimo,
    }
  );
  return resultado.affectedRows > 0;
}

// RF-13, RF-14: desactivar o reactivar no toca el stock ni el historial.
// No existe función de borrado (RF-15).
export async function cambiarEstado(id, activo) {
  const [resultado] = await pool.query(
    'UPDATE productos SET activo = :activo WHERE id = :id',
    { id, activo: activo ? 1 : 0 }
  );
  return resultado.affectedRows > 0;
}

// RF-12: la unidad solo se puede cambiar mientras no haya movimientos de stock ni ventas.
export async function tieneVentasOMovimientos(id) {
  const [filas] = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM movimientos_stock WHERE producto_id = :id)
         OR EXISTS (SELECT 1 FROM detalle_ventas WHERE producto_id = :id) AS tiene`,
    { id }
  );
  return Boolean(filas[0].tiene);
}

// RF-25, RF-29, RF-43 (spec 003): bloquea las filas de los productos de una venta o de una
// anulación con FOR UPDATE. Siempre en orden de id, para que dos operaciones que comparten
// productos no se bloqueen entre sí (interbloqueo). Incluye productos desactivados.
// Se ejecuta con la conexión de la transacción: el bloqueo dura hasta su commit o rollback.
export async function bloquearPorIds(conexion, ids) {
  if (ids.length === 0) return [];
  const [filas] = await conexion.query(
    `SELECT id, nombre, codigo_barras, precio_venta, stock, stock_minimo, unidad_medida, activo
     FROM productos
     WHERE id IN (:ids)
     ORDER BY id
     FOR UPDATE`,
    { ids }
  );
  return filas.map(convertirNumeros);
}

// RF-22–27, RF-30: ajuste manual de stock en UNA transacción.
// SELECT ... FOR UPDATE bloquea la fila: dos ajustes simultáneos se ejecutan uno tras otro
// y el segundo ve el stock ya descontado (RF-27, RNF-1). No exige que esté activo (RF-30).
// Devuelve { ok: true, stock, diferencia } o { ok: false, codigo, mensaje, stockActual }.
export async function ajustarStock({ productoId, usuarioId, tipo, cantidad, nota, hoy }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [filas] = await conexion.query(
      'SELECT id, stock, unidad_medida FROM productos WHERE id = :productoId FOR UPDATE',
      { productoId }
    );
    if (filas.length === 0) {
      await conexion.rollback();
      return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el producto' };
    }

    const producto = filas[0];
    const stockActual = aNumero(producto.stock);
    const calculo = calcularAjuste({
      tipo, cantidad, stockActual, unidad: producto.unidad_medida,
    });
    if (!calculo.ok) {
      await conexion.rollback();
      return calculo;
    }

    await conexion.query(
      'UPDATE productos SET stock = :stock WHERE id = :productoId',
      { stock: calculo.stockNuevo, productoId }
    );
    await movimientosStock.insertar(conexion, armarMovimiento({
      productoId,
      usuarioId,
      tipo,
      stockAntes: stockActual,
      stockDespues: calculo.stockNuevo,
      nota,
      hoy,
    }));

    await conexion.commit();
    return { ok: true, stock: calculo.stockNuevo, diferencia: calculo.diferencia };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
