// Rutas del ciclo de venta, su carrito, cobro e historial (specs 001 y 003).
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import {
  agregarLinea,
  anularVenta,
  cambiarCantidad,
  cancelarVenta,
  confirmarVenta,
  detalle,
  enCurso,
  iniciarVenta,
  listar,
  quitarLinea,
  registrarActividad,
  vaciarCarrito,
} from '../controllers/ventas.controller.js';

const router = Router();

router.use(autenticar);

// Las rutas fijas van antes de "/:id" para que no se interpreten como un identificador.
router.get('/en-curso', enCurso);
router.post('/iniciar', iniciarVenta);
router.post('/:id/actividad', registrarActividad);

// Carrito de la venta en curso (spec 003, RF-3–8): la dueña de la venta o un administrador.
router.post('/:id/lineas', agregarLinea);
router.patch('/:id/lineas/:productoId', cambiarCantidad);
router.delete('/:id/lineas/:productoId', quitarLinea);
router.delete('/:id/lineas', vaciarCarrito);

// Cobro: reemplaza a "finalizar" y es la única forma de terminar una venta con productos.
router.post('/:id/confirmar', confirmarVenta);
router.post('/:id/cancelar', cancelarVenta);

// Gestión: solo el administrador (spec 001 RF-11 y RF-28; spec 003 RF-35–47).
router.get('/', requiereRol('administrador'), listar);
router.get('/:id', requiereRol('administrador'), detalle);
router.post('/:id/anular', requiereRol('administrador'), anularVenta);

export default router;
