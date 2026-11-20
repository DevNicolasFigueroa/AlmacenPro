// Controlador de autenticación y gestión de cuentas (spec 001).
import * as usuariosModelo from '../models/usuarios.model.js';
import * as ventasModelo from '../models/ventas.model.js';
import {
  cifrar,
  coincide,
  emitirToken,
  generarCodigoRecuperacion,
  generarContrasenaTemporal,
} from '../services/credenciales.js';
import { ErrorApi } from '../middlewares/errores.js';
import {
  credencialesCompletas,
  esContrasenaValida,
  esIdentificadorValido,
  esRolValido,
  estadoDeBloqueo,
  normalizarIdentificador,
  puedeCerrarSesion,
  puedeDesactivar,
  puedeRecuperarAdministrador,
  siguienteIntento,
} from '../utils/validaciones.js';

function datosPublicos(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    requiereCambioContrasena: Boolean(usuario.requiere_cambio_contrasena),
  };
}

export async function iniciarSesion(req, res) {
  const { usuario, password } = req.body ?? {};
  const hoy = new Date();

  // RF-3: un dato faltante no se contabiliza como intento fallido.
  if (!String(usuario ?? '').trim()) {
    throw new ErrorApi(400, 'Debes ingresar tu usuario');
  }
  if (!String(password ?? '').trim()) {
    throw new ErrorApi(400, 'Debes ingresar tu contraseña');
  }

  const usuarioNormalizado = normalizarIdentificador(usuario);
  const usuarioEncontrado = await usuariosModelo.buscarPorUsuario(usuarioNormalizado);

  // Para cuentas inexistentes se usa el mismo mensaje: no se revela si el usuario existe.
  if (!usuarioEncontrado) {
    throw new ErrorApi(401, 'Usuario o contraseña incorrectos');
  }

  const bloqueo = estadoDeBloqueo(
    usuarioEncontrado.intentos_fallidos,
    usuarioEncontrado.bloqueado_hasta,
    hoy
  );
  if (bloqueo.bloqueado) {
    throw new ErrorApi(429, `Demasiados intentos. Intenta nuevamente en ${bloqueo.minutosRestantes} minutos`);
  }

  if (!(await coincide(password, usuarioEncontrado.password_hash))) {
    const siguiente = siguienteIntento(usuarioEncontrado.intentos_fallidos, false, hoy);
    await usuariosModelo.actualizarIntentos(usuarioEncontrado.id, siguiente);

    if (siguiente.intentos >= 5) {
      throw new ErrorApi(429, 'Demasiados intentos. Intenta nuevamente en 15 minutos');
    }
    throw new ErrorApi(401, 'Usuario o contraseña incorrectos');
  }

  if (!usuarioEncontrado.activo) {
    throw new ErrorApi(403, 'Esta cuenta está desactivada. Consulta con el administrador');
  }

  // RF-8: un ingreso correcto reinicia el contador de intentos fallidos.
  await usuariosModelo.reiniciarIntentos(usuarioEncontrado.id);

  const token = emitirToken(usuarioEncontrado);
  res.json({
    mensaje: 'Sesión iniciada correctamente',
    token,
    usuario: datosPublicos(usuarioEncontrado),
    aviso: usuarioEncontrado.requiere_cambio_contrasena
      ? 'Usas una contraseña temporal: debes cambiarla antes de continuar'
      : null,
  });
}

export async function cerrarSesion(req, res) {
  if (!puedeCerrarSesion(req.usuario.ventaActiva)) {
    throw new ErrorApi(409, 'Termina o cancela la venta antes de cerrar sesión');
  }

  await usuariosModelo.incrementarVersion(req.usuario.id);
  res.json({ mensaje: 'Sesión cerrada correctamente' });
}

export async function listarUsuarios(_req, res) {
  res.json(await usuariosModelo.listar());
}

export async function crearCuenta(req, res) {
  const { nombre, usuario, password, rol = 'cajero' } = req.body ?? {};

  if (!String(nombre ?? '').trim()) {
    throw new ErrorApi(400, 'Debes ingresar el nombre de la persona');
  }
  if (!esRolValido(rol)) {
    throw new ErrorApi(400, 'El rol debe ser administrador o cajero');
  }

  const usuarioNormalizado = normalizarIdentificador(usuario);
  if (!esIdentificadorValido(usuarioNormalizado)) {
    throw new ErrorApi(
      400,
      'El usuario debe tener entre 3 y 50 caracteres: letras, números, punto, guion o guion bajo'
    );
  }
  if (await usuariosModelo.buscarPorUsuario(usuarioNormalizado)) {
    throw new ErrorApi(409, 'Ya existe una cuenta con ese usuario');
  }

  let passwordHash;
  let codigoRecuperacion = null;
  let contrasenaTemporal = null;
  let requiereCambioContrasena = false;

  if (rol === 'administrador') {
    // RF-12: el administrador elige su contraseña; RF-18: recibe además un código de respaldo.
    if (!esContrasenaValida(password, usuarioNormalizado)) {
      throw new ErrorApi(
        400,
        'La contraseña debe tener al menos 8 caracteres y no puede ser igual al usuario'
      );
    }
    passwordHash = await cifrar(password);
    codigoRecuperacion = generarCodigoRecuperacion();
  } else {
    // RF-13: el cajero recibe una clave temporal que debe cambiar en su primer ingreso.
    contrasenaTemporal = generarContrasenaTemporal();
    passwordHash = await cifrar(contrasenaTemporal);
    requiereCambioContrasena = true;
  }

  const id = await usuariosModelo.crear({
    nombre: String(nombre).trim(),
    usuario: usuarioNormalizado,
    passwordHash,
    rol,
    codigoRecuperacionHash: codigoRecuperacion ? await cifrar(codigoRecuperacion) : null,
    requiereCambioContrasena,
  });

  res.status(201).json({
    mensaje: 'Cuenta creada correctamente',
    id,
    ...(codigoRecuperacion && {
      codigoRecuperacion,
      aviso: 'Guarda este código en un lugar seguro: no se volverá a mostrar',
    }),
    ...(contrasenaTemporal && {
      contrasenaTemporal,
      aviso: 'Entrega esta contraseña al cajero en persona: se muestra una sola vez',
    }),
  });
}

export async function cambiarEstado(req, res) {
  const id = Number(req.params.id);
  const { activo } = req.body ?? {};

  if (activo !== true && activo !== false) {
    throw new ErrorApi(400, 'Indica si la cuenta debe activarse o desactivarse');
  }

  const objetivo = await usuariosModelo.buscarPorId(id);
  if (!objetivo) {
    throw new ErrorApi(404, 'No se encontró la cuenta indicada');
  }
  if (!puedeDesactivar(objetivo.rol)) {
    throw new ErrorApi(409, 'Las cuentas de administrador son permanentes');
  }

  const ventaActiva = await ventasModelo.buscarEnCursoPorUsuario(id);
  await usuariosModelo.cambiarEstado(id, activo);

  let mensaje = activo
    ? 'Cuenta activada correctamente'
    : 'Cuenta desactivada correctamente';
  if (!activo && ventaActiva) {
    mensaje = 'Cuenta desactivada; podrá terminar o cancelar la venta en curso antes de perder el acceso';
  }

  res.json({ mensaje });
}

export async function restablecerContrasenaCajero(req, res) {
  const objetivo = await usuariosModelo.buscarPorId(Number(req.params.id));
  if (!objetivo) {
    throw new ErrorApi(404, 'No se encontró la cuenta indicada');
  }
  if (!puedeDesactivar(objetivo.rol)) {
    throw new ErrorApi(409, 'Las cuentas de administrador son permanentes');
  }

  const contrasenaTemporal = generarContrasenaTemporal();
  await usuariosModelo.guardarContrasena(objetivo.id, await cifrar(contrasenaTemporal), true);

  res.json({
    mensaje: 'Contraseña temporal generada. El cajero debe cambiarla en su primer ingreso',
    contrasenaTemporal,
    aviso: 'Se muestra una sola vez; entrégala en persona al cajero',
  });
}

export async function cambiarContrasena(req, res) {
  const { contrasenaActual, nuevaContrasena } = req.body ?? {};

  const usuario = await usuariosModelo.buscarPorId(req.usuario.id);
  if (!usuario || !(await coincide(contrasenaActual, usuario.password_hash))) {
    throw new ErrorApi(403, 'La contraseña actual es incorrecta');
  }
  if (!esContrasenaValida(nuevaContrasena, usuario.usuario)) {
    throw new ErrorApi(
      400,
      'La nueva contraseña debe tener al menos 8 caracteres y no puede ser igual al usuario'
    );
  }

  await usuariosModelo.guardarContrasena(usuario.id, await cifrar(nuevaContrasena));
  res.json({ mensaje: 'Contraseña actualizada. Inicia sesión nuevamente' });
}

export async function recuperarContrasenaAdmin(req, res) {
  const { usuario, codigoRecuperacion, nuevaContrasena } = req.body ?? {};

  if (
    !credencialesCompletas(usuario, codigoRecuperacion)
    || !esContrasenaValida(nuevaContrasena, normalizarIdentificador(usuario))
  ) {
    throw new ErrorApi(
      400,
      'Completa usuario, código de recuperación y nueva contraseña válida (mínimo 8 caracteres, distinta del usuario)'
    );
  }

  const objetivo = await usuariosModelo.buscarPorUsuario(normalizarIdentificador(usuario));
  const codigoValido = objetivo
    ? await coincide(codigoRecuperacion, objetivo.codigo_recuperacion_hash)
    : false;

  // Mensaje uniforme: no distingue entre usuario inexistente, cajero o código usado.
  if (!objetivo
      || !puedeRecuperarAdministrador(objetivo.rol, Boolean(objetivo.codigo_recuperacion_hash), codigoValido)) {
    throw new ErrorApi(401, 'Código de recuperación incorrecto o ya utilizado');
  }

  const consumido = await usuariosModelo.consumirCodigoRecuperacion(
    objetivo.id,
    await cifrar(nuevaContrasena),
    objetivo.codigo_recuperacion_hash
  );
  if (!consumido) {
    throw new ErrorApi(401, 'Código de recuperación incorrecto o ya utilizado');
  }

  res.json({ mensaje: 'Contraseña restablecida. Inicia sesión con tu nueva contraseña' });
}
