// Rutas de clientes (spec 003). Cajero y administrador identifican y registran clientes por RUT
// al vender; solo el administrador ve la cuenta completa de un cliente (RF-23, RF-24).
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import { buscarPorRut, cuenta, listar, registrar } from '../controllers/clientes.controller.js';

const router = Router();

router.use(autenticar);

router.get('/rut/:rut', buscarPorRut);
router.post('/', registrar);
router.get('/:id/cuenta', requiereRol('administrador'), cuenta);

router.get('/', requiereRol('administrador'), listar);

export default router;
