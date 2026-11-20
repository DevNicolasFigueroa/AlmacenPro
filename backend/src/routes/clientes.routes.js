// Rutas de clientes y fiado. Solo el administrador gestiona cuentas corrientes.
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import { listar } from '../controllers/clientes.controller.js';

const router = Router();

router.use(autenticar);

router.get('/', requiereRol('administrador'), listar);

export default router;
