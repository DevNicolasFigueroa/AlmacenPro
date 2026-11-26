// Rutas de reportes (spec 005). Exclusivas del administrador, también por acceso directo.
// El cierre de caja, que sí pueden usar los cajeros, está en cierresCaja.routes.js.
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import { ganancias, masVendidos, porReponer, ventas } from '../controllers/reportes.controller.js';

const router = Router();

router.use(autenticar, requiereRol('administrador'));

router.get('/ventas', ventas);
router.get('/ganancias', ganancias);
router.get('/mas-vendidos', masVendidos);
router.get('/por-reponer', porReponer);

export default router;
