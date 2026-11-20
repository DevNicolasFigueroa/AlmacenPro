// Modelo de productos: consultas SQL a la tabla "productos".
import { pool } from '../config/db.js';

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
