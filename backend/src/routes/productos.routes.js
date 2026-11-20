// Rutas de productos. Solo el administrador puede modificar el inventario;
// el cajero solo puede consultar stock (requisito del POS).
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import { listar, crear } from '../controllers/productos.controller.js';

const router = Router();

router.use(autenticar); // todas las rutas requieren sesión

router.get('/', listar);
router.post('/', requiereRol('administrador'), crear);

export default router;
