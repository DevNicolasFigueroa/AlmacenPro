// Rutas del cierre de caja (spec 005). Las usa cualquier cuenta que atiende el mesón: cada persona cierra
// su propio turno y el cajero solo ve sus cierres. Los turnos sin cerrar son del administrador. No hay
// rutas para editar ni borrar un cierre (RF-22). Las rutas fijas van antes de "/:id".
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import { cerrar, detalle, listar, sinCerrar, turno } from '../controllers/cierresCaja.controller.js';

const router = Router();

router.use(autenticar);

router.get('/turno', turno);
router.get('/sin-cerrar', requiereRol('administrador'), sinCerrar);
router.get('/', listar);
router.post('/', cerrar);
router.get('/:id', detalle);

export default router;
