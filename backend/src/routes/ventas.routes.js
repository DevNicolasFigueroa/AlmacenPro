// Rutas del ciclo de venta, su carrito e historial (specs 001 y 003).
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import {
  agregarLinea,
  cambiarCantidad,
  cancelarVenta,
  enCurso,
  finalizarVenta,
  iniciarVenta,
  listar,
  quitarLinea,
  registrarActividad,
  vaciarCarrito,
} from '../controllers/ventas.controller.js';

const router = Router();

router.use(autenticar);

router.get('/en-curso', enCurso);
router.post('/iniciar', iniciarVenta);
router.post('/:id/actividad', registrarActividad);
router.post('/:id/finalizar', finalizarVenta);
router.post('/:id/cancelar', cancelarVenta);

// Carrito de la venta en curso (spec 003, RF-3–8): la dueña de la venta o un administrador.
router.post('/:id/lineas', agregarLinea);
router.patch('/:id/lineas/:productoId', cambiarCantidad);
router.delete('/:id/lineas/:productoId', quitarLinea);
router.delete('/:id/lineas', vaciarCarrito);

// Historial de gestion: solo el administrador (RF-11 y RF-28).
router.get('/', requiereRol('administrador'), listar);

export default router;
