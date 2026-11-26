// Middlewares de autenticación y autorización (spec 001).
// Además del token, se consulta el estado real del usuario y su venta en curso en cada petición.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import * as usuariosModelo from '../models/usuarios.model.js';
import * as ventasModelo from '../models/ventas.model.js';
import {
  debeCambiarContrasena,
  esRutaDeVentaEnCurso,
  estadoInactividadVenta,
  sesionAceptable,
} from '../utils/validaciones.js';

export async function autenticar(req, res, siguiente) {
  const cabecera = req.headers.authorization ?? '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ mensaje: 'No autenticado: falta el token de acceso' });
  }

  let datosToken;
  try {
    datosToken = jwt.verify(token, env.jwt.secreto);
  } catch (error) {
    if (error.name !== 'TokenExpiredError') {
      return res.status(401).json({ mensaje: 'Token inválido, inicia sesión nuevamente' });
    }
    // La firma ya fue verificada: solo venció el tiempo. Se decide más abajo si aplica la gracia.
    datosToken = jwt.decode(token);
  }

  if (!datosToken?.id) {
    return res.status(401).json({ mensaje: 'Token inválido, inicia sesión nuevamente' });
  }

  try {
    const hoy = new Date();
    const usuario = await usuariosModelo.buscarPorId(datosToken.id);
    if (!usuario) {
      return res.status(401).json({ mensaje: 'Tu cuenta ya no existe, inicia sesión nuevamente' });
    }

    // Verificación perezosa: si esta venta ya superó los 15 minutos, se cancela ahora
    // aunque el barrido periódico no haya alcanzado a ejecutarse.
    let ventaActiva = await ventasModelo.buscarEnCursoPorUsuario(usuario.id);
    if (ventaActiva && estadoInactividadVenta(ventaActiva.ultima_actividad, hoy) === 'cancelar') {
      await ventasModelo.cancelarAutomaticamente(ventaActiva, hoy);
      ventaActiva = null;
    }

    if (datosToken.ver !== usuario.token_version) {
      // El token se emitió en segundos enteros: se compara desde el inicio de ese segundo.
      if (datosToken.iat
          && await ventasModelo.huboCancelacionAutomaticaDesde(usuario.id, new Date(datosToken.iat * 1000))) {
        return res.status(401).json({
          mensaje: 'Tu venta se canceló tras 15 minutos sin actividad y la sesión se cerró. Inicia sesión nuevamente',
        });
      }
      return res.status(401).json({
        mensaje: 'La sesión fue cerrada o la contraseña cambió, inicia sesión nuevamente',
      });
    }

    if (datosToken.exp
        && sesionAceptable(new Date(datosToken.exp * 1000), hoy, Boolean(ventaActiva)) === 'expirada') {
      return res.status(401).json({ mensaje: 'Tu sesión de 8 horas expiró, inicia sesión nuevamente' });
    }

    const ruta = req.originalUrl.split('?')[0];

    if (!usuario.activo && !ventaActiva) {
      return res.status(403).json({
        mensaje: 'Esta cuenta está desactivada. Consulta con el administrador',
      });
    }

    // Un cajero desactivado a mitad de venta solo puede terminarla o cancelarla.
    if (!usuario.activo && ventaActiva && !esRutaDeVentaEnCurso(req.method, ruta)) {
      return res.status(403).json({
        mensaje: 'Termina o cancela la venta antes de cerrar sesión',
      });
    }

    if (debeCambiarContrasena(usuario.requiere_cambio_contrasena, ruta)) {
      return res.status(403).json({
        mensaje: 'Debes cambiar tu contraseña temporal antes de continuar',
      });
    }

    req.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: Boolean(usuario.activo),
      ventaActiva,
      requiereCambioContrasena: Boolean(usuario.requiere_cambio_contrasena),
    };
    return siguiente();
  } catch (error) {
    return siguiente(error);
  }
}

// Restringe la ruta a roles específicos. Uso: requiereRol('administrador')
export function requiereRol(...rolesPermitidos) {
  return (req, res, siguiente) => {
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: 'No tienes permisos para realizar esta acción' });
    }
    return siguiente();
  };
}
