// Controlador de productos: listado y creación (módulo de referencia del MVP).
import * as productosModelo from '../models/productos.model.js';
import { ErrorApi } from '../middlewares/errores.js';

export async function listar(req, res) {
  const { buscar, stockBajo } = req.query;
  const productos = await productosModelo.listar({
    textoBusqueda: buscar ?? '',
    soloStockBajo: stockBajo === '1',
    incluirCosto: req.usuario.rol === 'administrador',
  });
  res.json(productos);
}

export async function crear(req, res) {
  const { nombre, precioVenta, stock } = req.body;

  if (!nombre?.trim()) {
    throw new ErrorApi(400, 'El nombre del producto es obligatorio');
  }
  if (precioVenta == null || precioVenta <= 0) {
    throw new ErrorApi(400, 'El precio de venta debe ser mayor a cero');
  }

  const id = await productosModelo.crear(req.body);
  res.status(201).json({ mensaje: 'Producto creado correctamente', id });
}
