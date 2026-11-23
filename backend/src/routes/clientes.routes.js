// Rutas de clientes (specs 003 y 004). Cajero y administrador identifican, registran y buscan
// clientes, ven su cuenta y el detalle de sus compras, y editan sus datos. Las rutas fijas van
// antes de "/:id" para que no se interpreten como un identificador.
import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import {
  actualizar,
  buscarPorRut,
  cuenta,
  detalleCompra,
  listar,
  registrar,
} from '../controllers/clientes.controller.js';

const router = Router();

router.use(autenticar);

router.get('/rut/:rut', buscarPorRut);
router.get('/', listar);
router.post('/', registrar);
router.get('/:id/cuenta', cuenta);
router.get('/:id/compras/:ventaId', detalleCompra);
router.patch('/:id', actualizar);

export default router;
