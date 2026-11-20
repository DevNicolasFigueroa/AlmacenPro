// Emisión de credenciales de sesión y generación de claves temporales.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// Duración fija de la sesión según la spec: 8 horas desde el inicio de sesión.
const DURACION_SESION = '8h';

export function emitirToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      ver: usuario.token_version, // cambia al cerrar sesión o restablecer contraseña
    },
    env.jwt.secreto,
    { expiresIn: DURACION_SESION, jwtid: crypto.randomUUID() }
  );
}

export async function cifrar(texto) {
  return bcrypt.hash(texto, 10);
}

export async function coincide(texto, hash) {
  return Boolean(hash) && bcrypt.compare(texto, hash);
}

// Contraseña temporal de un solo uso para cajeros: 12 caracteres legibles.
export function generarContrasenaTemporal() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 12);
}

// Código de recuperación del administrador: 24 caracteres, se muestra una sola vez.
export function generarCodigoRecuperacion() {
  return crypto.randomBytes(18).toString('base64url');
}
