// Controlador de clientes (spec 003): el RUT es el único identificador; el nombre es opcional.
// Los abonos, la edición de clientes y el listado de deudores son de la spec de clientes y fiado.
import * as clientesModelo from '../models/clientes.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import { esRutValido, formatearRut, normalizarRut } from '../utils/rut.js';
import { estadoCuenta } from '../utils/ventas.js';

const LONGITUD_MAXIMA_NOMBRE = 150;

// RF-20, RNF-10: el RUT debe tener forma de RUT y dígito verificador correcto.
function leerRut(texto) {
  const rut = normalizarRut(texto);
  if (!rut || !esRutValido(rut)) {
    throw new ErrorApi(400, 'El RUT no es válido: revisa que esté bien escrito, con su dígito verificador', {
      codigo: 'RUT_INVALIDO',
    });
  }
  return rut;
}

// RF-20: el nombre es opcional; si se escribe, se recorta y tiene un tope.
function leerNombre(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw new ErrorApi(400, 'El nombre debe ser un texto');
  const nombre = valor.trim().replace(/\s+/g, ' ');
  if (nombre.length > LONGITUD_MAXIMA_NOMBRE) {
    throw new ErrorApi(400, `El nombre admite hasta ${LONGITUD_MAXIMA_NOMBRE} caracteres`);
  }
  return nombre === '' ? null : nombre;
}

// RF-24: el cajero solo ve lo necesario para atender al cliente (identidad y saldo).
function armarCliente(cliente, saldo, rol) {
  const basico = {
    id: cliente.id,
    rut: cliente.rut,
    rut_formateado: formatearRut(cliente.rut),
    nombre: cliente.nombre,
    saldo,
    estado: estadoCuenta(saldo),
  };
  if (rol !== 'administrador') return basico;
  return { ...basico, telefono: cliente.telefono, creado_en: cliente.creado_en };
}

// RF-17, RF-18, RF-22: identifica al cliente por su RUT y entrega su saldo antes de cobrar.
export async function buscarPorRut(req, res) {
  const rut = leerRut(req.params.rut);
  const cliente = await clientesModelo.buscarPorRut(rut);
  if (!cliente) {
    throw new ErrorApi(404, 'No hay un cliente registrado con ese RUT', {
      codigo: 'CLIENTE_NO_REGISTRADO',
      rut,
    });
  }

  const saldo = await clientesModelo.obtenerSaldo(cliente.id);
  res.json(armarCliente(cliente, saldo, req.usuario.rol));
}

// RF-20, RF-21: registra un cliente con solo su RUT (el nombre se anota si se entrega).
// Un RUT ya registrado no se duplica: se indica quién es para ofrecer elegirlo.
export async function registrar(req, res) {
  const rut = leerRut(req.body?.rut);
  const nombre = leerNombre(req.body?.nombre);

  async function responderRepetido() {
    const existente = await clientesModelo.buscarPorRut(rut);
    const saldo = await clientesModelo.obtenerSaldo(existente.id);
    const quien = existente.nombre ?? formatearRut(existente.rut);
    throw new ErrorApi(409, `Ese RUT ya está registrado a nombre de ${quien}: elige a ese cliente`, {
      codigo: 'RUT_REPETIDO',
      cliente: armarCliente(existente, saldo, req.usuario.rol),
    });
  }

  if (await clientesModelo.buscarPorRut(rut)) await responderRepetido();

  let id;
  try {
    id = await clientesModelo.crear({ rut, nombre });
  } catch (error) {
    // Dos registros del mismo RUT a la vez: el segundo lo rechaza el índice único.
    if (error.code === 'ER_DUP_ENTRY') await responderRepetido();
    throw error;
  }

  const cliente = await clientesModelo.buscarPorId(id);
  res.status(201).json({
    mensaje: 'Cliente registrado',
    cliente: armarCliente(cliente, 0, req.usuario.rol),
  });
}

// RF-23: cuenta completa del cliente (saldo, compras y fiados). Solo el administrador.
export async function cuenta(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(404, 'No se encontró el cliente');
  }

  const resultado = await clientesModelo.obtenerCuenta(id);
  if (!resultado) throw new ErrorApi(404, 'No se encontró el cliente');

  res.json({
    cliente: armarCliente(resultado.cliente, resultado.saldo, 'administrador'),
    compras: resultado.compras,
    movimientos: resultado.movimientos,
  });
}

// El listado de deudores pertenece a la spec de clientes y fiado.
export function listar(req, res) {
  res.status(501).json({ mensaje: 'Listado de clientes: implementación pendiente' });
}
