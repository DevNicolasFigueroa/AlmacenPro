// Funciones puras de decisión de clientes y fiado (spec 004).
// Ninguna lee reloj, base de datos ni red.
import { formatearPesos } from './ventas.js';

export const METODOS_ABONO = ['efectivo', 'debito', 'credito', 'transferencia'];
export const MONTO_MAXIMO_ABONO = 99_999_999;
export const LONGITUD_MAXIMA_OBSERVACION = 255;
export const ESTADOS_LISTADO = ['todos', 'deuda', 'a_favor', 'al_dia'];
export const ORDENES_LISTADO = ['nombre', 'deuda'];
export const CLIENTES_POR_PAGINA = 25;

const LIMITES_DATOS = { nombre: 150, telefono: 20, email: 120, direccion: 200 };
const NOMBRES_DATOS = { nombre: 'El nombre', telefono: 'El teléfono', email: 'El correo', direccion: 'La dirección' };

// RF-10: el abono es en pesos enteros, mayor que 0 y con un tope que evita errores de tipeo.
export function validarMontoAbono(monto) {
  let valor = NaN;
  if (typeof monto === 'number') {
    valor = monto;
  } else if (typeof monto === 'string' && monto.trim() !== '') {
    valor = /^-?\d+(\.\d+)?$/.test(monto.trim()) ? Number(monto.trim()) : NaN;
  }

  if (!Number.isFinite(valor)) {
    return { ok: false, mensaje: 'Escribe el monto del abono en pesos' };
  }
  if (!Number.isInteger(valor)) {
    return { ok: false, mensaje: 'El monto debe ser en pesos enteros, sin decimales' };
  }
  if (valor <= 0) {
    return { ok: false, mensaje: 'El monto del abono debe ser mayor que $0' };
  }
  if (valor > MONTO_MAXIMO_ABONO) {
    return { ok: false, mensaje: `El monto máximo de un abono es ${formatearPesos(MONTO_MAXIMO_ABONO)}` };
  }
  return { ok: true, monto: valor };
}

// RF-10: cómo pagó el cliente. Solo se anota; no se conecta con ningún terminal de pago.
export function validarMetodoAbono(metodo) {
  if (!METODOS_ABONO.includes(metodo)) {
    return { ok: false, mensaje: 'Elige cómo pagó el cliente: efectivo, débito, crédito o transferencia' };
  }
  return { ok: true, metodo };
}

// RF-11, RF-12: saldo que quedará y si el abono supera la deuda. Funciona igual con un cliente en
// deuda, al día o con saldo a favor: el saldo resultante negativo es dinero a favor del cliente.
export function evaluarAbono({ saldo, monto }) {
  const saldoActual = Math.round(Number(saldo ?? 0));
  const saldoResultante = saldoActual - Math.round(Number(monto));
  return {
    saldoActual,
    saldoResultante,
    quedaAFavor: saldoResultante < 0 ? -saldoResultante : 0,
    requiereConfirmacion: saldoResultante < 0,
  };
}

// RF-26, principio 5: cargos − abonos − anulaciones de venta + anulaciones de abono.
// Positivo es deuda; cero, al día; negativo, saldo a favor.
const SIGNO_MOVIMIENTO = { cargo: 1, abono: -1, anulacion: -1, anulacion_abono: 1 };

export function calcularSaldo(movimientos) {
  return movimientos.reduce((suma, movimiento) => {
    const signo = SIGNO_MOVIMIENTO[movimiento.tipo];
    if (signo === undefined) {
      throw new Error(`Tipo de movimiento de fiado desconocido: ${movimiento.tipo}`);
    }
    return suma + signo * Math.round(Number(movimiento.monto));
  }, 0);
}

// RF-16, RF-17: solo se anula un abono, y una sola vez.
export function puedeAnularAbono(movimiento, yaAnulado) {
  if (!movimiento || movimiento.tipo !== 'abono') {
    return { ok: false, mensaje: 'Solo se pueden anular abonos' };
  }
  if (yaAnulado) {
    return { ok: false, mensaje: 'Ese abono ya está anulado' };
  }
  return { ok: true };
}

// RF-10: observación opcional del abono.
export function normalizarObservacion(texto) {
  if (texto === undefined || texto === null) return { ok: true, observacion: null };
  const observacion = String(texto).trim().replace(/\s+/g, ' ');
  if (observacion.length > LONGITUD_MAXIMA_OBSERVACION) {
    return { ok: false, mensaje: `La observación admite hasta ${LONGITUD_MAXIMA_OBSERVACION} caracteres` };
  }
  return { ok: true, observacion: observacion === '' ? null : observacion };
}

function validarDato(campo, valor) {
  if (typeof valor !== 'string') {
    return { ok: false, mensaje: `${NOMBRES_DATOS[campo]} debe ser un texto` };
  }
  const texto = valor.trim().replace(/\s+/g, ' ');
  if (texto === '') return { ok: true, valor: null }; // vacío borra el dato
  if (texto.length > LIMITES_DATOS[campo]) {
    return { ok: false, mensaje: `${NOMBRES_DATOS[campo]} admite hasta ${LIMITES_DATOS[campo]} caracteres` };
  }
  if (campo === 'telefono' && (!/^[\d\s+\-()]+$/.test(texto) || !/\d/.test(texto))) {
    return { ok: false, mensaje: 'El teléfono solo puede tener números, espacios, +, - y paréntesis' };
  }
  if (campo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
    return { ok: false, mensaje: 'El correo no tiene un formato válido, por ejemplo nombre@correo.cl' };
  }
  return { ok: true, valor: texto };
}

// RF-20: nombre, teléfono, correo y dirección, todos opcionales. Solo se valida lo que viene en la
// petición; un texto vacío borra el dato y queda como null.
export function validarDatosCliente(datos) {
  const resultado = {};
  for (const campo of Object.keys(LIMITES_DATOS)) {
    if (datos?.[campo] === undefined) continue;
    const dato = validarDato(campo, datos[campo]);
    if (!dato.ok) return dato;
    resultado[campo] = dato.valor;
  }
  if (Object.keys(resultado).length === 0) {
    return { ok: false, mensaje: 'No hay datos para guardar' };
  }
  return { ok: true, datos: resultado };
}

// RF-2: separa lo escrito en un texto para buscar por nombre y una forma sin puntos ni espacios
// para buscar por RUT (completo o parcial). Si lo escrito no puede ser parte de un RUT, rut es null.
export function interpretarBusqueda(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  const sinFormato = limpio.replace(/[.\s]/g, '').toUpperCase();
  const puedeSerRut = /^[\dK-]+$/.test(sinFormato) && /\d/.test(sinFormato);
  return { texto: limpio, rut: puedeSerRut ? sinFormato : null };
}

// Los comodines de LIKE (% y _) escritos por la persona se buscan como texto normal.
export function escaparComodinesLike(texto) {
  return String(texto).replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

// RF-3, RF-4: filtros del listado. Con "en deuda" se ordena por deuda salvo que se pida otra cosa.
export function validarFiltroListado({ estado, orden, pagina } = {}) {
  const estadoElegido = estado === undefined || estado === '' ? 'todos' : estado;
  if (!ESTADOS_LISTADO.includes(estadoElegido)) {
    return { ok: false, mensaje: 'El estado debe ser todos, deuda, a_favor o al_dia' };
  }

  const ordenElegido = orden === undefined || orden === ''
    ? (estadoElegido === 'deuda' ? 'deuda' : 'nombre')
    : orden;
  if (!ORDENES_LISTADO.includes(ordenElegido)) {
    return { ok: false, mensaje: 'El orden debe ser nombre o deuda' };
  }

  let paginaElegida = 1;
  if (pagina !== undefined && pagina !== '') {
    paginaElegida = /^\d+$/.test(String(pagina)) ? Number(pagina) : NaN;
    if (!Number.isInteger(paginaElegida) || paginaElegida < 1) {
      return { ok: false, mensaje: 'La página debe ser un número entero desde 1' };
    }
  }

  return { ok: true, estado: estadoElegido, orden: ordenElegido, pagina: paginaElegida };
}
