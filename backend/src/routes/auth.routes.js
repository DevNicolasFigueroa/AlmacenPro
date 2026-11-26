// Rutas de autenticación y cuentas. No existe registro público (spec 001, RF-11).
import { Router } from 'express';
import { autenticar, requiereRol } from '../middlewares/auth.js';
import {
  cambiarContrasena,
  cambiarEstado,
  cerrarSesion,
  crearCuenta,
  iniciarSesion,
  listarCuentasDemo,
  listarUsuarios,
  recuperarContrasenaAdmin,
  restablecerContrasena,
} from '../controllers/auth.controller.js';

const router = Router();

// Rutas públicas
router.post('/login', iniciarSesion);
router.post('/recuperar-contrasena', recuperarContrasenaAdmin);
router.get('/cuentas-demo', listarCuentasDemo);

// A partir de aquí se exige sesión activa
router.use(autenticar);

router.post('/logout', cerrarSesion);
router.post('/cambiar-contrasena', cambiarContrasena);

// Gestión de cuentas: solo el administrador (RF-4)
router.get('/usuarios', requiereRol('administrador'), listarUsuarios);
router.post('/usuarios', requiereRol('administrador'), crearCuenta);
router.patch('/usuarios/:id/estado', requiereRol('administrador'), cambiarEstado);
router.patch('/usuarios/:id/contrasena', requiereRol('administrador'), restablecerContrasena);

export default router;
