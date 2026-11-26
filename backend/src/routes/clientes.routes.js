// Rutas de clientes (specs 003 y 004). Cajero y administrador identifican, registran y buscan
// clientes, ven su cuenta y el detalle de sus compras, editan sus datos, corrigen su RUT y
// registran abonos. Solo el administrador anula un abono. Las rutas fijas van antes de "/:id" para
// que no se interpreten como un identificador. Los abonos no se editan ni se borran: no hay rutas.
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import {
  actualizar,
  anularAbono,
  buscarPorRut,
  cambiarRut,
  cuenta,
  detalleCompra,
  listar,
  registrar,
  registrarAbono,
} from '../controllers/clientes.controller.js';

const router = Router();

router.use(autenticar);

router.get('/rut/:rut', buscarPorRut);
router.get('/', listar);
router.post('/', registrar);
router.get('/:id/cuenta', cuenta);
router.get('/:id/compras/:ventaId', detalleCompra);
router.patch('/:id', actualizar);
router.patch('/:id/rut', cambiarRut);
router.post('/:id/abonos', registrarAbono);
router.post('/:id/abonos/:abonoId/anular', requiereRol('administrador'), anularAbono);

export default router;
