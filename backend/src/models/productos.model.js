// Modelo de productos: consultas SQL a la tabla "productos".
import { pool } from '../config/db.js';

// El costo solo se proyecta cuando el rol lo puede ver (RF-11, RF-12):
// ocultarlo únicamente en la interfaz no basta, el dato viajaría en la respuesta.
export async function listar({ textoBusqueda = '', soloStockBajo = false, incluirCosto = false } = {}) {
  let sql = `
    SELECT p.id, p.codigo_barras, p.nombre, p.descripcion,
           p.categoria_id, c.nombre AS categoria,
           ${incluirCosto ? 'p.precio_costo,' : ''}
           p.precio_venta, p.stock, p.stock_minimo,
           p.unidad_medida, p.activo
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1`;

  const parametros = {};

  if (textoBusqueda) {
    // Permite buscar por nombre o escanear un código de barras
    sql += ' AND (p.nombre LIKE :textoBusqueda OR p.codigo_barras = :codigo)';
    parametros.textoBusqueda = `%${textoBusqueda}%`;
    parametros.codigo = textoBusqueda;
  }

  if (soloStockBajo) {
    sql += ' AND p.stock <= p.stock_minimo';
  }

  sql += ' ORDER BY p.nombre';
  const [filas] = await pool.query(sql, parametros);
  return filas;
}

export async function crear(producto) {
  const [resultado] = await pool.query(
    `INSERT INTO productos
       (codigo_barras, nombre, descripcion, categoria_id,
        precio_costo, precio_venta, stock, stock_minimo, unidad_medida)
     VALUES
       (:codigoBarras, :nombre, :descripcion, :categoriaId,
        :precioCosto, :precioVenta, :stock, :stockMinimo, :unidadMedida)`,
    {
      codigoBarras: producto.codigoBarras ?? null,
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? null,
      categoriaId: producto.categoriaId ?? null,
      precioCosto: producto.precioCosto ?? 0,
      precioVenta: producto.precioVenta,
      stock: producto.stock ?? 0,
      stockMinimo: producto.stockMinimo ?? 0,
      unidadMedida: producto.unidadMedida ?? 'unidad',
    }
  );
  return resultado.insertId;
}
