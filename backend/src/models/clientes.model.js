// Modelo de clientes (spec 003): el RUT es el único identificador; el nombre es opcional.
// El RUT llega ya normalizado ("12345678-5", ver utils/rut.js).
import { pool } from '../config/db.js';
import * as fiadoTransacciones from './fiadoTransacciones.model.js';

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

// Las funciones de lectura reciben opcionalmente la conexión de una transacción para que la
// venta lea al cliente dentro de la misma operación que la confirma.
export async function buscarPorRut(rut, conexion = pool) {
  const [filas] = await conexion.query(
    'SELECT id, rut, nombre, telefono, creado_en FROM clientes WHERE rut = :rut',
    { rut }
  );
  return filas[0] ?? null;
}

export async function buscarPorId(id, conexion = pool) {
  const [filas] = await conexion.query(
    'SELECT id, rut, nombre, telefono, creado_en FROM clientes WHERE id = :id',
    { id }
  );
  return filas[0] ?? null;
}

// RF-20: solo exige el RUT; el nombre se anota si se entrega y si no, queda vacío.
// Si dos registros del mismo RUT compiten, el índice UNIQUE rechaza el segundo (ER_DUP_ENTRY).
export async function crear({ rut, nombre = null }, conexion = pool) {
  const [resultado] = await conexion.query(
    'INSERT INTO clientes (rut, nombre) VALUES (:rut, :nombre)',
    { rut, nombre: nombre || null }
  );
  return resultado.insertId;
}

// RF-17, RF-18: saldo pendiente (positivo), al día (0) o a favor (negativo).
export async function obtenerSaldo(clienteId, conexion = pool) {
  const [filas] = await conexion.query(
    'SELECT saldo_fiado FROM v_saldo_fiado WHERE cliente_id = :clienteId',
    { clienteId }
  );
  return filas[0] ? aNumero(filas[0].saldo_fiado) : 0;
}

// RF-23, RF-48: compras del cliente (ventas completadas y anuladas asociadas a su RUT),
// de la más reciente a la más antigua. Las anuladas siguen visibles, marcadas como tales.
async function listarCompras(clienteId) {
  const [filas] = await pool.query(
    `SELECT v.id, v.fecha, v.total, v.metodo_pago, v.estado,
            v.anulada_en, v.motivo_anulacion, u.nombre AS cajero_nombre
     FROM ventas v
     JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.cliente_id = :clienteId AND v.estado IN ('completada', 'anulada')
     ORDER BY v.fecha DESC, v.id DESC`,
    { clienteId }
  );
  return filas.map((fila) => ({ ...fila, total: aNumero(fila.total) }));
}

// RF-23: cuenta completa del cliente. Solo la ve el administrador.
export async function obtenerCuenta(clienteId) {
  const cliente = await buscarPorId(clienteId);
  if (!cliente) return null;

  const [saldo, compras, movimientos] = await Promise.all([
    obtenerSaldo(clienteId),
    listarCompras(clienteId),
    fiadoTransacciones.listarPorCliente(clienteId),
  ]);
  return { cliente, saldo, compras, movimientos };
}
