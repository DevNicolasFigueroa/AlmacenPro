// Rutas de reportes. Exclusivas del administrador.
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import { ventasDelDia } from '../controllers/reportes.controller.js';

const router = Router();

router.use(autenticar, requiereRol('administrador'));

router.get('/ventas-hoy', ventasDelDia);

export default router;
