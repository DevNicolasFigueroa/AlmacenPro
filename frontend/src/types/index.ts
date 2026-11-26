// Tipos compartidos del dominio (alineados con el esquema MySQL y la spec 001).
export type Rol = 'administrador' | 'cajero';

export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
  requiereCambioContrasena: boolean;
}

export interface RespuestaLogin {
  mensaje: string;
  token: string;
  usuario: Usuario;
  aviso: string | null;
}

// Cuenta pública de la demostración (solo llega con MODO_DEMO=true en el servidor).
export interface CuentaDemo {
  usuario: string;
  password: string;
  rol: Rol;
}

export interface Cuenta {
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: number;
  intentos_fallidos: number;
  requiere_cambio_contrasena: number;
  creado_en: string;
  actualizado_en?: string;
}

export interface CuentaNueva {
  nombre: string;
  usuario: string;
  password?: string; // obligatoria solo para administradores
  rol: Rol;
}

export interface RespuestaCuenta {
  mensaje: string;
  id: number;
  codigoRecuperacion?: string;
  contrasenaTemporal?: string;
  aviso?: string;
}

export interface RespuestaContrasena {
  mensaje: string;
  contrasenaTemporal?: string;
  aviso?: string;
}

export interface VentaActiva {
  id: number;
  usuario_id: number;
  estado: 'en_curso';
  iniciada_en: string;
  ultima_actividad: string;
  total: number;
}

export type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'fiado';

// Línea del carrito (spec 003): el precio queda congelado al agregar el producto.
export interface LineaVenta {
  producto_id: number;
  nombre: string;
  codigo_barras: string | null;
  unidad_medida: UnidadMedida;
  stock: number; // stock actual del producto, para avisar en pantalla
  activo: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Carrito {
  lineas: LineaVenta[];
  total: number;
}

export interface UltimaVenta {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: MetodoPago;
}

export interface RespuestaVentaActiva extends Carrito {
  ventaActiva: VentaActiva | null;
  aviso: boolean;
  segundosParaCancelar: number;
  ultimaVenta: UltimaVenta | null;
}

export type EstadoVenta = 'en_curso' | 'completada' | 'anulada' | 'cancelada' | 'cancelada_automaticamente';

// Fila del historial de ventas (spec 003, solo administrador). La fecha es la de cierre.
export interface VentaHistorial {
  id: number;
  fecha: string;
  total: number;
  estado: EstadoVenta;
  iniciada_en: string;
  ultima_actividad: string;
  cancelada_en: string | null;
  metodo_pago: MetodoPago | null; // solo si la venta se confirmó
  usuario_id: number;
  cajero_nombre: string;
  cajero_usuario: string;
  cliente_id: number | null;
  cliente_rut: string | null;
  cliente_nombre: string | null;
}

// Solo las completadas suman su total; anuladas y canceladas se cuentan aparte.
export interface ResumenHistorial {
  completadas: { cantidad: number; total: number };
  anuladas: { cantidad: number };
  canceladas: { cantidad: number };
}

export interface RespuestaHistorial {
  desde: string;
  hasta: string;
  ventas: VentaHistorial[];
  resumen: ResumenHistorial;
}

export interface LineaDetalle {
  producto_id: number;
  nombre: string;
  unidad_medida: UnidadMedida;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface DetalleVentaCompleto extends VentaHistorial {
  anulada_en: string | null;
  motivo_anulacion: string | null;
  anulada_por_nombre: string | null;
  cliente_rut_formateado: string | null;
  lineas: LineaDetalle[];
}

export interface CompraCliente {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: MetodoPago;
  estado: 'completada' | 'anulada';
  anulada_en: string | null;
  motivo_anulacion: string | null;
  cajero_nombre: string;
}

// Cómo pagó el cliente un abono (spec 004, RF-10).
export type MetodoAbono = 'efectivo' | 'debito' | 'credito' | 'transferencia';

// Movimiento de la cuenta de fiado: cargo (venta al fiado), abono (pago), anulación de una venta
// fiada y anulación de un abono. Los abonos traen su método y, si fueron anulados, cuándo, quién y por qué.
export interface MovimientoFiado {
  id: number;
  tipo: 'cargo' | 'abono' | 'anulacion' | 'anulacion_abono';
  monto: number;
  metodo_pago: MetodoAbono | null;
  venta_id: number | null;
  abono_anulado_id: number | null;
  observacion: string | null;
  fecha: string;
  usuario_nombre: string;
  anulado?: boolean;
  anulado_en?: string | null;
  motivo_anulacion?: string | null;
  anulado_por_nombre?: string | null;
}

// Cliente con su contacto, saldo y estado (spec 004, RF-7): lo ven el cajero y el administrador.
export interface ClienteCuenta extends ClienteVenta {
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  creado_en: string;
}

// Constancia de una corrección de RUT: solo la ve el administrador (spec 004, RF-25).
export interface CambioRut {
  id: number;
  rut_anterior: string;
  rut_nuevo: string;
  rut_anterior_formateado: string;
  rut_nuevo_formateado: string;
  creado_en: string;
  usuario_nombre: string;
}

// Cuenta completa del cliente: saldo, compras y movimientos para ambos roles; cambios_rut solo
// llega al administrador.
export interface CuentaCliente {
  cliente: ClienteCuenta;
  compras: CompraCliente[];
  movimientos: MovimientoFiado[];
  cambios_rut?: CambioRut[];
}

// Fila del listado de clientes (spec 004, RF-1).
export interface FilaCliente {
  id: number;
  rut: string;
  rut_formateado: string;
  nombre: string | null;
  telefono: string | null;
  saldo: number;
  estado: EstadoCuenta;
}

// Solo lo recibe el administrador (spec 004, RF-6).
export interface ResumenClientes {
  clientes_en_deuda: number;
  total_por_cobrar: number;
}

export interface ListadoClientes {
  clientes: FilaCliente[];
  total: number;
  pagina: number;
  por_pagina: number;
  resumen?: ResumenClientes;
}

export type UnidadMedida = 'unidad' | 'kilo';
// El backend calcula estado_stock en cada lectura (spec 002, RF-31); la pantalla solo lo pinta.
export type EstadoStock = 'agotado' | 'bajo' | 'normal' | 'sin_alerta';

export interface Producto {
  id: number;
  codigo_barras: string | null;
  nombre: string;
  descripcion: string | null;
  categoria_id: number | null;
  categoria: string | null;
  precio_costo?: number; // solo para administradores (spec 001 RF-12; spec 002 RF-20)
  precio_venta: number;
  stock: number;
  stock_minimo: number;
  unidad_medida: UnidadMedida;
  activo: number;
  estado_stock: EstadoStock;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export interface ResumenStock {
  stockBajo: number;
  agotados: number;
}

export type TipoAjuste = 'merma' | 'reposicion' | 'correccion';
export type TipoMovimiento = 'stock_inicial' | TipoAjuste | 'venta' | 'anulacion_venta';

export interface MovimientoStock {
  id: number;
  producto_id: number;
  tipo: TipoMovimiento;
  cantidad: number; // diferencia con signo
  stock_antes: number;
  stock_despues: number;
  nota: string | null;
  venta_id: number | null;
  creado_en: string;
  usuario_nombre: string;
  usuario: string;
}

// Producto que se puede vender: activo y sin costo (GET /productos/vendibles).
export type ProductoVendible = Pick<Producto,
  'id' | 'codigo_barras' | 'nombre' | 'categoria' | 'precio_venta' | 'stock' | 'stock_minimo'
  | 'unidad_medida' | 'estado_stock'>;

export type EstadoCuenta = 'deuda' | 'al_dia' | 'a_favor';

// Cliente identificado por su RUT (spec 003). El cajero solo recibe estos campos.
export interface ClienteVenta {
  id: number;
  rut: string; // "12345678-5"
  rut_formateado: string; // "12.345.678-5"
  nombre: string | null;
  saldo: number; // positivo = deuda; negativo = saldo a favor
  estado: EstadoCuenta;
}

// Problema que impide confirmar (stock insuficiente o producto desactivado).
export interface ProblemaConfirmacion {
  codigo: 'STOCK_INSUFICIENTE' | 'PRODUCTO_DESACTIVADO' | 'CARRITO_VACIO';
  productoId?: number;
  nombre?: string | null;
  mensaje: string;
  stockDisponible?: number;
}

export interface ProductoVendido {
  id: number;
  nombre: string;
  unidad_medida: UnidadMedida;
  stock: number;
  stock_minimo: number;
  activo: number;
  estado_stock: EstadoStock;
}

export interface RespuestaConfirmacion {
  mensaje: string;
  venta: { id: number; total: number; metodo_pago: MetodoPago; cliente_id: number | null; fecha: string };
  vuelto: number | null;
  cliente: { saldo: number; estado: EstadoCuenta } | null;
  productos: ProductoVendido[];
}

// ---------------------------------------------------------------------------
// Reportes y cierre de caja (spec 005)
// ---------------------------------------------------------------------------

export interface DesgloseMetodo {
  cantidad: number;
  total: number;
}

// Lo vendido por período. Solo las completadas suman; las anuladas y canceladas van aparte.
export interface ReporteVentas {
  desde: string;
  hasta: string;
  vendido: number;
  cantidad: number;
  promedio: number;
  por_metodo: Record<MetodoPago, DesgloseMetodo>;
  anuladas: { cantidad: number; total: number };
  canceladas: { cantidad: number };
  por_cajero: { usuario_id: number; nombre: string; cantidad: number; total: number }[];
  por_dia: { dia: string; cantidad: number; total: number }[];
  // Lo cobrado: ventas en efectivo, débito y crédito más abonos. Lo vendido al fiado no es cobrado.
  cobrado: {
    ventas: { efectivo: number; debito: number; credito: number };
    abonos: { efectivo: number; debito: number; credito: number; transferencia: number; sin_metodo?: number };
    total_ventas: number;
    total_abonos: number;
    total: number;
    vendido_al_fiado: number;
  };
}

export interface GananciaProducto {
  producto_id: number;
  nombre: string;
  unidad_medida: UnidadMedida;
  cantidad: number;
  vendido: number;
  costo: number;
  ganancia: number;
  margen: number;
  costo_cero: boolean; // alguna línea vendida tenía costo $0: la ganancia puede estar sobrestimada
}

export interface ReporteGanancias {
  desde: string;
  hasta: string;
  vendido: number;
  costo: number;
  ganancia: number;
  margen: number;
  productos: GananciaProducto[];
  total_productos: number;
  productos_con_costo_cero: number;
  // Ventas anteriores a la spec 005, sin costo registrado: no entran a la ganancia.
  sin_costo: { cantidad: number; total: number };
}

export interface ProductoMasVendido {
  producto_id: number;
  nombre: string;
  unidad_medida: UnidadMedida;
  activo: boolean;
  cantidad: number;
  monto: number;
}

export interface ReporteMasVendidos {
  desde: string;
  hasta: string;
  limite: number;
  productos: ProductoMasVendido[];
}

export interface ProductoPorReponer {
  id: number;
  nombre: string;
  unidad_medida: UnidadMedida;
  stock: number;
  stock_minimo: number;
  estado: 'agotado' | 'bajo';
}

export interface ReportePorReponer {
  productos: ProductoPorReponer[];
  resumen: { agotados: number; stock_bajo: number };
}

// Datos para cerrar el turno. Nunca incluye lo esperado: el conteo es a ciegas hasta confirmar.
export interface TurnoActual {
  desde: string | null;
  cierre_anterior_id: number | null;
  fondo_sugerido: number | null;
  venta_en_curso: boolean;
}

export type EstadoCierre = 'cuadra' | 'sobra' | 'falta';

export interface CierreCaja {
  id: number;
  usuario_id: number;
  usuario_nombre: string;
  usuario_acceso: string;
  cierre_anterior_id: number | null;
  desde: string | null;
  cerrado_en: string;
  fondo_inicial: number;
  efectivo_contado: number;
  efectivo_esperado: number;
  diferencia: number; // positiva sobra, negativa falta
  efectivo_devuelto: number;
  cantidad_ventas: number;
  ventas_efectivo: number;
  ventas_debito: number;
  ventas_credito: number;
  ventas_fiado: number;
  abonos_efectivo: number;
  abonos_debito: number;
  abonos_credito: number;
  abonos_transferencia: number;
  observacion: string | null;
  estado: EstadoCierre;
}

export interface RespuestaCierre {
  mensaje: string;
  cierre: CierreCaja;
  resultado: { estado: EstadoCierre; diferencia: number; texto: string };
}

export interface RespuestaListaCierres {
  desde: string;
  hasta: string;
  cierres: CierreCaja[];
}

export interface TurnoSinCerrar {
  usuario_id: number;
  nombre: string;
  activo: boolean;
  desde: string | null;
  cantidad_ventas: number;
  efectivo_cobrado: number;
}
