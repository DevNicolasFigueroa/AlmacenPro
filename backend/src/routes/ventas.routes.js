// Rutas del ciclo de venta en curso e historial (spec 001).
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import {
  cancelarVenta,
  crear,
  enCurso,
  finalizarVenta,
  iniciarVenta,
  listar,
  registrarActividad,
} from '../controllers/ventas.controller.js';

const router = Router();

router.use(autenticar);

router.get('/en-curso', enCurso);
router.post('/iniciar', iniciarVenta);
router.post('/:id/actividad', registrarActividad);
router.post('/:id/finalizar', finalizarVenta);
router.post('/:id/cancelar', cancelarVenta);

// Historial de gestion: solo el administrador (RF-11 y RF-28).
router.get('/', requiereRol('administrador'), listar);
router.post('/', crear);

export default router;
