// Rutas de productos e inventario (spec 002). Solo el administrador puede modificar el
// inventario; el cajero consulta productos, stock y el resumen de alertas.
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import {
  ajustar,
  cambiarEstado,
  crear,
  editar,
  listar,
  listarCategorias,
  listarMovimientos,
  resumenStock,
} from '../controllers/productos.controller.js';

const router = Router();

router.use(autenticar); // todas las rutas requieren sesión

// Las rutas fijas van antes de "/:id" para que no se interpreten como un identificador.
router.get('/', listar);
router.get('/resumen-stock', resumenStock);
router.get('/categorias', listarCategorias);

router.post('/', requiereRol('administrador'), crear);
router.put('/:id', requiereRol('administrador'), editar);
router.patch('/:id/estado', requiereRol('administrador'), cambiarEstado);
router.post('/:id/ajustes', requiereRol('administrador'), ajustar);
router.get('/:id/movimientos', requiereRol('administrador'), listarMovimientos);

export default router;
