// Controlador de clientes (specs 003 y 004): el RUT es el único identificador; el nombre es opcional.
// Cajero y administrador ven la cuenta de un cliente, la buscan en el listado y editan sus datos.
// Lo reservado al administrador es el total por cobrar y el historial de cambios de RUT.
import * as clientesModelo from '../models/clientes.model.js';
import * as ventasModelo from '../models/ventas.model.js';
import { ErrorApi } from '../middlewares/errores.js';
import {
  normalizarObservacion,
  validarDatosCliente,
  validarFiltroListado,
  validarMetodoAbono,
  validarMontoAbono,
} from '../utils/clientes.js';
import { esRutValido, formatearRut, normalizarRut } from '../utils/rut.js';
import { estadoCuenta, normalizarMotivo } from '../utils/ventas.js';

const LONGITUD_MAXIMA_NOMBRE = 150;
const LONGITUD_MAXIMA_BUSQUEDA = 100;

// Código HTTP de cada rechazo que informan los modelos; lo no listado es un conflicto (409).
const ESTADO_POR_CODIGO = {
  CLIENTE_NO_ENCONTRADO: 404,
  ABONO_NO_ENCONTRADO: 404,
  RUT_SIN_CAMBIOS: 400,
};

// Convierte un { ok: false, codigo, mensaje, ... } del modelo en el error de la API, conservando
// el código y los datos que la pantalla necesita (saldo, cuánto quedaría a favor, quién tiene un RUT...).
function lanzarRechazo({ ok: _ok, mensaje, ...datos }) {
  throw new ErrorApi(ESTADO_POR_CODIGO[datos.codigo] ?? 409, mensaje, datos);
}

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

// Spec 003, RF-20: el nombre es opcional; si se escribe, se recorta y tiene un tope.
function leerNombre(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw new ErrorApi(400, 'El nombre debe ser un texto');
  const nombre = valor.trim().replace(/\s+/g, ' ');
  if (nombre.length > LONGITUD_MAXIMA_NOMBRE) {
    throw new ErrorApi(400, `El nombre admite hasta ${LONGITUD_MAXIMA_NOMBRE} caracteres`);
  }
  return nombre === '' ? null : nombre;
}

function leerId(valor, mensaje = 'No se encontró el cliente') {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorApi(404, mensaje);
  return id;
}

// Spec 004, RF-7: la cuenta ya no es reservada al administrador, así que ambos roles ven el mismo
// cliente, con su contacto, su saldo y si está en deuda, al día o a favor.
function armarCliente(cliente, saldo) {
  return {
    id: cliente.id,
    rut: cliente.rut,
    rut_formateado: formatearRut(cliente.rut),
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    email: cliente.email,
    direccion: cliente.direccion,
    creado_en: cliente.creado_en,
    saldo,
    estado: estadoCuenta(saldo),
  };
}

// RF-1: fila del listado, con lo justo para reconocer al cliente y su saldo.
function armarFila(fila) {
  return {
    id: fila.id,
    rut: fila.rut,
    rut_formateado: formatearRut(fila.rut),
    nombre: fila.nombre,
    telefono: fila.telefono,
    saldo: fila.saldo,
    estado: estadoCuenta(fila.saldo),
  };
}

// Spec 003, RF-17, RF-18, RF-22: identifica al cliente por su RUT y entrega su saldo antes de cobrar.
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
  res.json(armarCliente(cliente, saldo));
}

// Spec 003, RF-20, RF-21: registra un cliente con solo su RUT (el nombre se anota si se entrega).
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
      cliente: armarCliente(existente, saldo),
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
    cliente: armarCliente(cliente, 0),
  });
}

// Spec 004, RF-1 a RF-6: listado paginado con búsqueda, filtro por estado y orden. Solo el
// administrador recibe el resumen (clientes en deuda y total por cobrar).
export async function listar(req, res) {
  const filtro = validarFiltroListado({
    estado: req.query.estado,
    orden: req.query.orden,
    pagina: req.query.pagina,
  });
  if (!filtro.ok) throw new ErrorApi(400, filtro.mensaje);

  const buscar = typeof req.query.buscar === 'string'
    ? req.query.buscar.slice(0, LONGITUD_MAXIMA_BUSQUEDA)
    : '';
  const resultado = await clientesModelo.listar({
    buscar,
    estado: filtro.estado,
    orden: filtro.orden,
    pagina: filtro.pagina,
    incluirResumen: req.usuario.rol === 'administrador',
  });

  res.json({
    clientes: resultado.clientes.map(armarFila),
    total: resultado.total,
    pagina: resultado.pagina,
    por_pagina: resultado.porPagina,
    ...(resultado.resumen && { resumen: resultado.resumen }),
  });
}

// Spec 004, RF-7, RF-25, RF-27: cuenta completa del cliente (saldo, compras y fiados) para ambos
// roles; solo al administrador, además, el historial de cambios de RUT.
export async function cuenta(req, res) {
  const id = leerId(req.params.id);
  const esAdministrador = req.usuario.rol === 'administrador';

  const resultado = await clientesModelo.obtenerCuenta(id, { incluirCambiosRut: esAdministrador });
  if (!resultado) throw new ErrorApi(404, 'No se encontró el cliente');

  res.json({
    cliente: armarCliente(resultado.cliente, resultado.saldo),
    compras: resultado.compras,
    movimientos: resultado.movimientos,
    ...(esAdministrador && {
      cambios_rut: resultado.cambiosRut.map((cambio) => ({
        ...cambio,
        rut_anterior_formateado: formatearRut(cambio.rut_anterior),
        rut_nuevo_formateado: formatearRut(cambio.rut_nuevo),
      })),
    }),
  });
}

// Spec 004, RF-7, RF-9: detalle de una compra (completada o anulada) de la cuenta de un cliente, para
// ambos roles. Solo se entrega si la venta es de ese cliente: así el cajero no llega a ventas de otras
// personas, y el detalle no trae costos ni márgenes.
export async function detalleCompra(req, res) {
  const clienteId = leerId(req.params.id);
  const ventaId = leerId(req.params.ventaId, 'No se encontró la compra indicada');

  const venta = await ventasModelo.obtenerDetalle(ventaId);
  const esCompraDelCliente = venta
    && venta.cliente_id === clienteId
    && ['completada', 'anulada'].includes(venta.estado);
  if (!esCompraDelCliente) throw new ErrorApi(404, 'No se encontró la compra indicada');

  res.json({ ...venta, cliente_rut_formateado: venta.cliente_rut ? formatearRut(venta.cliente_rut) : null });
}

// Spec 004, RF-20: agrega, cambia o borra el nombre, el teléfono, el correo y la dirección.
export async function actualizar(req, res) {
  const id = leerId(req.params.id);
  const validacion = validarDatosCliente(req.body);
  if (!validacion.ok) throw new ErrorApi(400, validacion.mensaje);

  const cliente = await clientesModelo.actualizarDatos(id, validacion.datos);
  if (!cliente) throw new ErrorApi(404, 'No se encontró el cliente');

  const saldo = await clientesModelo.obtenerSaldo(id);
  res.json({ mensaje: 'Datos del cliente guardados', cliente: armarCliente(cliente, saldo) });
}

// Spec 004, RF-10 a RF-15: registra un abono (pago general del cliente). Si supera la deuda, la
// primera solicitud responde 409 ABONO_SUPERA_DEUDA con cuánto quedaría a favor y no registra nada;
// la pantalla pide confirmar y reenvía con confirmar_saldo_a_favor.
export async function registrarAbono(req, res) {
  const clienteId = leerId(req.params.id);

  const monto = validarMontoAbono(req.body?.monto);
  if (!monto.ok) throw new ErrorApi(400, monto.mensaje, { codigo: 'MONTO_INVALIDO' });
  const metodo = validarMetodoAbono(req.body?.metodo_pago);
  if (!metodo.ok) throw new ErrorApi(400, metodo.mensaje, { codigo: 'METODO_INVALIDO' });
  const observacion = normalizarObservacion(req.body?.observacion);
  if (!observacion.ok) throw new ErrorApi(400, observacion.mensaje);

  const resultado = await clientesModelo.registrarAbono({
    clienteId,
    usuarioId: req.usuario.id,
    monto: monto.monto,
    metodoPago: metodo.metodo,
    observacion: observacion.observacion,
    confirmarSaldoAFavor: req.body?.confirmar_saldo_a_favor === true,
    hoy: new Date(),
  });
  if (!resultado.ok) lanzarRechazo(resultado);

  res.status(201).json({
    mensaje: 'Abono registrado',
    abono: {
      id: resultado.abonoId,
      monto: monto.monto,
      metodo_pago: metodo.metodo,
      observacion: observacion.observacion,
    },
    saldo_anterior: resultado.saldoAnterior,
    saldo_nuevo: resultado.saldoNuevo,
    estado: estadoCuenta(resultado.saldoNuevo),
  });
}

// Spec 004, RF-16 a RF-19: anula un abono con un motivo (solo administrador, lo exige la ruta).
export async function anularAbono(req, res) {
  const clienteId = leerId(req.params.id);
  const abonoId = leerId(req.params.abonoId, 'No se encontró el abono indicado');
  const motivo = normalizarMotivo(req.body?.motivo);
  if (!motivo.ok) throw new ErrorApi(400, motivo.mensaje);

  const resultado = await clientesModelo.anularAbono({
    clienteId, abonoId, usuarioId: req.usuario.id, motivo: motivo.motivo, hoy: new Date(),
  });
  if (!resultado.ok) lanzarRechazo(resultado);

  res.json({
    mensaje: 'Abono anulado: su monto volvió a sumarse a la deuda',
    saldo_nuevo: resultado.saldoNuevo,
    estado: estadoCuenta(resultado.saldoNuevo),
  });
}

// Spec 004, RF-21 a RF-25: corrige el RUT del cliente. Sin confirmar: true no cambia nada y avisa que
// compras, fiados y saldo pasan al RUT nuevo; si el RUT ya es de otro cliente, se indica quién.
export async function cambiarRut(req, res) {
  const clienteId = leerId(req.params.id);
  const rutNuevo = leerRut(req.body?.rut);

  const resultado = await clientesModelo.cambiarRut({
    clienteId,
    rutNuevo,
    confirmar: req.body?.confirmar === true,
    usuarioId: req.usuario.id,
    hoy: new Date(),
  });

  if (!resultado.ok && resultado.codigo === 'RUT_REPETIDO') {
    const otro = resultado.cliente;
    const quien = otro.nombre ?? formatearRut(otro.rut);
    throw new ErrorApi(409, `Ese RUT ya está registrado a nombre de ${quien}: no se pueden unir dos clientes`, {
      codigo: 'RUT_REPETIDO',
      cliente: { id: otro.id, rut: otro.rut, rut_formateado: formatearRut(otro.rut), nombre: otro.nombre },
    });
  }
  if (!resultado.ok) lanzarRechazo(resultado);

  const cliente = await clientesModelo.buscarPorId(clienteId);
  const saldo = await clientesModelo.obtenerSaldo(clienteId);
  res.json({
    mensaje: 'RUT corregido: las compras, los fiados y el saldo quedaron con el RUT nuevo',
    rut_anterior_formateado: formatearRut(resultado.rutAnterior),
    cliente: armarCliente(cliente, saldo),
  });
}
