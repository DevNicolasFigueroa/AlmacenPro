// Modelo de clientes (specs 003 y 004): el RUT es el único identificador; el nombre es opcional.
// El RUT llega ya normalizado ("12345678-5", ver utils/rut.js).
// Las operaciones que cambian la cuenta (abonos, anulaciones y cambio de RUT) bloquean primero la
// fila del cliente con FOR UPDATE: así se serializan entre sí y el saldo se evalúa con el valor real.
import { pool } from '../config/db.js';
import {
  CLIENTES_POR_PAGINA,
  escaparComodinesLike,
  evaluarAbono,
  interpretarBusqueda,
  puedeAnularAbono,
} from '../utils/clientes.js';
import { formatearPesos } from '../utils/ventas.js';
import * as cambiosRut from './cambiosRut.model.js';
import * as fiadoTransacciones from './fiadoTransacciones.model.js';

const COLUMNAS_CLIENTE = 'id, rut, nombre, telefono, email, direccion, creado_en';
const COLUMNAS_EDITABLES = ['nombre', 'telefono', 'email', 'direccion'];

function aNumero(valor) {
  return valor === null || valor === undefined ? valor : Number(valor);
}

const CLIENTE_NO_ENCONTRADO = {
  ok: false,
  codigo: 'CLIENTE_NO_ENCONTRADO',
  mensaje: 'No se encontró el cliente',
};

// Las funciones de lectura reciben opcionalmente la conexión de una transacción para que la
// venta lea al cliente dentro de la misma operación que la confirma.
export async function buscarPorRut(rut, conexion = pool) {
  const [filas] = await conexion.query(
    `SELECT ${COLUMNAS_CLIENTE} FROM clientes WHERE rut = :rut`,
    { rut }
  );
  return filas[0] ?? null;
}

export async function buscarPorId(id, conexion = pool) {
  const [filas] = await conexion.query(
    `SELECT ${COLUMNAS_CLIENTE} FROM clientes WHERE id = :id`,
    { id }
  );
  return filas[0] ?? null;
}

// Spec 004: bloquea la fila del cliente dentro de una transacción.
export async function bloquearPorId(conexion, id) {
  const [filas] = await conexion.query(
    `SELECT ${COLUMNAS_CLIENTE} FROM clientes WHERE id = :id FOR UPDATE`,
    { id }
  );
  return filas[0] ?? null;
}

// Spec 003, RF-20: solo exige el RUT; el nombre se anota si se entrega y si no, queda vacío.
// Si dos registros del mismo RUT compiten, el índice UNIQUE rechaza el segundo (ER_DUP_ENTRY).
export async function crear({ rut, nombre = null }, conexion = pool) {
  const [resultado] = await conexion.query(
    'INSERT INTO clientes (rut, nombre) VALUES (:rut, :nombre)',
    { rut, nombre: nombre || null }
  );
  return resultado.insertId;
}

// Spec 003, RF-17, RF-18: saldo pendiente (positivo), al día (0) o a favor (negativo).
export async function obtenerSaldo(clienteId, conexion = pool) {
  const [filas] = await conexion.query(
    'SELECT saldo_fiado FROM v_saldo_fiado WHERE cliente_id = :clienteId',
    { clienteId }
  );
  return filas[0] ? aNumero(filas[0].saldo_fiado) : 0;
}

// ---------------------------------------------------------------------------
// Listado y búsqueda (spec 004, RF-1 a RF-6)
// ---------------------------------------------------------------------------

const CONDICION_POR_ESTADO = {
  deuda: 'saldo_fiado > 0',
  a_favor: 'saldo_fiado < 0',
  al_dia: 'saldo_fiado = 0',
};

// RF-2: nombre parcial (la colación ignora mayúsculas y tildes) o RUT parcial sin puntos.
function armarFiltro({ buscar, estado }) {
  const condiciones = [];
  const parametros = {};

  const busqueda = interpretarBusqueda(buscar);
  if (busqueda.texto !== '') {
    const porNombre = 'nombre LIKE :nombre';
    parametros.nombre = `%${escaparComodinesLike(busqueda.texto)}%`;
    if (busqueda.rut) {
      condiciones.push(`(${porNombre} OR rut LIKE :rut)`);
      parametros.rut = `%${escaparComodinesLike(busqueda.rut)}%`;
    } else {
      condiciones.push(porNombre);
    }
  }
  if (CONDICION_POR_ESTADO[estado]) condiciones.push(CONDICION_POR_ESTADO[estado]);

  return { donde: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', parametros };
}

// RF-4: por nombre y, si no lo tiene, por RUT; o de la mayor a la menor deuda.
const ORDEN = {
  nombre: 'ORDER BY nombre IS NULL, nombre, rut',
  deuda: 'ORDER BY saldo_fiado DESC, nombre IS NULL, nombre, rut',
};

// RF-1 a RF-6: listado paginado con saldo y estado. Con incluirResumen (solo el administrador)
// agrega la cantidad de clientes en deuda y el total por cobrar, sin compensar saldos a favor.
export async function listar({ buscar, estado = 'todos', orden = 'nombre', pagina = 1, incluirResumen = false }) {
  const { donde, parametros } = armarFiltro({ buscar, estado });
  const desplazamiento = (pagina - 1) * CLIENTES_POR_PAGINA;

  const [filas] = await pool.query(
    `SELECT cliente_id AS id, rut, nombre, telefono, saldo_fiado
     FROM v_saldo_fiado
     ${donde}
     ${ORDEN[orden] ?? ORDEN.nombre}
     LIMIT :limite OFFSET :desplazamiento`,
    { ...parametros, limite: CLIENTES_POR_PAGINA, desplazamiento }
  );
  const [[conteo]] = await pool.query(
    `SELECT COUNT(*) AS total FROM v_saldo_fiado ${donde}`,
    parametros
  );

  const resultado = {
    clientes: filas.map(({ saldo_fiado: saldo, ...fila }) => ({ ...fila, saldo: aNumero(saldo) })),
    total: Number(conteo.total),
    pagina,
    porPagina: CLIENTES_POR_PAGINA,
  };

  if (incluirResumen) {
    const [[resumen]] = await pool.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(saldo_fiado), 0) AS total
       FROM v_saldo_fiado
       WHERE saldo_fiado > 0`
    );
    resultado.resumen = { clientes_en_deuda: Number(resumen.cantidad), total_por_cobrar: aNumero(resumen.total) };
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Cuenta del cliente (spec 003, RF-23; spec 004, RF-7, RF-25, RF-27)
// ---------------------------------------------------------------------------

// Compras del cliente (ventas completadas y anuladas asociadas a su RUT), de la más reciente a la
// más antigua. Las anuladas siguen visibles, marcadas como tales.
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

// Cuenta completa del cliente: contacto, saldo, compras y movimientos. Solo con incluirCambiosRut
// (administrador) trae también el historial de cambios de RUT.
export async function obtenerCuenta(clienteId, { incluirCambiosRut = false } = {}) {
  const cliente = await buscarPorId(clienteId);
  if (!cliente) return null;

  const [saldo, compras, movimientos, cambios] = await Promise.all([
    obtenerSaldo(clienteId),
    listarCompras(clienteId),
    fiadoTransacciones.listarPorCliente(clienteId),
    incluirCambiosRut ? cambiosRut.listarPorCliente(clienteId) : Promise.resolve(undefined),
  ]);
  const cuenta = { cliente, saldo, compras, movimientos };
  if (cambios !== undefined) cuenta.cambiosRut = cambios;
  return cuenta;
}

// ---------------------------------------------------------------------------
// Datos del cliente (spec 004, RF-20)
// ---------------------------------------------------------------------------

// Guarda solo los datos recibidos (nombre, teléfono, correo y dirección; null borra el dato).
// Si dos personas editan a la vez, vale el último cambio guardado. Devuelve null si no existe.
export async function actualizarDatos(clienteId, datos) {
  const columnas = COLUMNAS_EDITABLES.filter((columna) => datos[columna] !== undefined);
  if (!(await buscarPorId(clienteId))) return null;

  if (columnas.length > 0) {
    await pool.query(
      `UPDATE clientes SET ${columnas.map((columna) => `${columna} = :${columna}`).join(', ')}
       WHERE id = :clienteId`,
      { ...Object.fromEntries(columnas.map((columna) => [columna, datos[columna]])), clienteId }
    );
  }
  return buscarPorId(clienteId);
}

// ---------------------------------------------------------------------------
// Abonos (spec 004, RF-10 a RF-19)
// ---------------------------------------------------------------------------

// RF-10 a RF-14: registra un abono en UNA transacción. El saldo se recalcula dentro de la
// transacción, con el cliente bloqueado: aunque la pantalla mostrara un saldo viejo, el aviso de
// saldo a favor se decide con el real. Si el abono supera la deuda y no viene confirmado, no se
// guarda nada y se informa cuánto quedaría a favor.
export async function registrarAbono({
  clienteId, usuarioId, monto, metodoPago, observacion, confirmarSaldoAFavor = false, hoy,
}) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    if (!(await bloquearPorId(conexion, clienteId))) {
      await conexion.rollback();
      return CLIENTE_NO_ENCONTRADO;
    }

    const saldoAnterior = await obtenerSaldo(clienteId, conexion);
    const evaluacion = evaluarAbono({ saldo: saldoAnterior, monto });
    if (evaluacion.requiereConfirmacion && !confirmarSaldoAFavor) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'ABONO_SUPERA_DEUDA',
        mensaje: `El abono supera la deuda: el cliente quedará con ${formatearPesos(evaluacion.quedaAFavor)} a favor. Confirma para registrarlo`,
        saldo: saldoAnterior,
        quedaAFavor: evaluacion.quedaAFavor,
      };
    }

    const abonoId = await fiadoTransacciones.insertarAbono(conexion, {
      clienteId, usuarioId, monto, metodoPago, observacion, hoy,
    });

    await conexion.commit();
    return { ok: true, abonoId, saldoAnterior, saldoNuevo: evaluacion.saldoResultante };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// RF-16 a RF-18: anula un abono con un motivo, sin límite de tiempo. El abono no se modifica: la
// anulación es un movimiento nuevo que vuelve a sumar el monto a la deuda.
export async function anularAbono({ clienteId, abonoId, usuarioId, motivo, hoy }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    if (!(await bloquearPorId(conexion, clienteId))) {
      await conexion.rollback();
      return CLIENTE_NO_ENCONTRADO;
    }

    const abono = await fiadoTransacciones.buscarMovimientoParaAnular(conexion, clienteId, abonoId);
    if (!abono) {
      await conexion.rollback();
      return { ok: false, codigo: 'ABONO_NO_ENCONTRADO', mensaje: 'No se encontró el abono indicado' };
    }

    const decision = puedeAnularAbono(abono, abono.yaAnulado);
    if (!decision.ok) {
      await conexion.rollback();
      return { ok: false, codigo: 'ABONO_NO_ANULABLE', mensaje: decision.mensaje };
    }

    await fiadoTransacciones.insertarAnulacionAbono(conexion, {
      clienteId, usuarioId, monto: abono.monto, abonoAnuladoId: abonoId, motivo, hoy,
    });
    const saldoNuevo = await obtenerSaldo(clienteId, conexion);

    await conexion.commit();
    return { ok: true, saldoNuevo };
  } catch (error) {
    await conexion.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      // Red de seguridad: el índice único impide anular dos veces el mismo abono.
      return { ok: false, codigo: 'ABONO_NO_ANULABLE', mensaje: 'Ese abono ya está anulado' };
    }
    throw error;
  } finally {
    conexion.release();
  }
}

// ---------------------------------------------------------------------------
// Corregir el RUT (spec 004, RF-21 a RF-25)
// ---------------------------------------------------------------------------

async function contarCompras(conexion, clienteId) {
  const [[fila]] = await conexion.query(
    `SELECT COUNT(*) AS n FROM ventas
     WHERE cliente_id = :clienteId AND estado IN ('completada', 'anulada')`,
    { clienteId }
  );
  return Number(fila.n);
}

// RF-21 a RF-24: cambia el RUT en UNA transacción. Compras, fiados y saldo cuelgan del cliente y no
// de su RUT, así que no se copia ni se mueve nada: basta cambiar la columna. Si el RUT nuevo ya es de
// otro cliente se rechaza (no se fusionan cuentas) y, sin confirmación explícita, no se cambia nada.
export async function cambiarRut({ clienteId, rutNuevo, confirmar = false, usuarioId, hoy }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const cliente = await bloquearPorId(conexion, clienteId);
    if (!cliente) {
      await conexion.rollback();
      return CLIENTE_NO_ENCONTRADO;
    }
    if (cliente.rut === rutNuevo) {
      await conexion.rollback();
      return { ok: false, codigo: 'RUT_SIN_CAMBIOS', mensaje: 'Ese ya es el RUT del cliente' };
    }

    const otro = await buscarPorRut(rutNuevo, conexion);
    if (otro) {
      await conexion.rollback();
      return { ok: false, codigo: 'RUT_REPETIDO', mensaje: 'Ese RUT ya pertenece a otro cliente', cliente: otro };
    }

    if (!confirmar) {
      const compras = await contarCompras(conexion, clienteId);
      const saldo = await obtenerSaldo(clienteId, conexion);
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'CONFIRMACION_REQUERIDA',
        mensaje: 'Todas las compras, los fiados y el saldo del cliente pasarán al RUT nuevo. Confirma para cambiarlo',
        compras,
        saldo,
      };
    }

    await conexion.query('UPDATE clientes SET rut = :rutNuevo WHERE id = :clienteId', { rutNuevo, clienteId });
    await cambiosRut.insertar(conexion, {
      clienteId, rutAnterior: cliente.rut, rutNuevo, usuarioId, hoy,
    });

    await conexion.commit();
    return { ok: true, rutAnterior: cliente.rut };
  } catch (error) {
    await conexion.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      // Dos personas con el mismo RUT nuevo a la vez: el índice único rechaza la segunda.
      const otro = await buscarPorRut(rutNuevo);
      return { ok: false, codigo: 'RUT_REPETIDO', mensaje: 'Ese RUT ya pertenece a otro cliente', cliente: otro };
    }
    throw error;
  } finally {
    conexion.release();
  }
}
