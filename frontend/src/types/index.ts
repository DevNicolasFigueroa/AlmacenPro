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

export interface MovimientoFiado {
  id: number;
  tipo: 'cargo' | 'abono' | 'anulacion';
  monto: number;
  venta_id: number | null;
  observacion: string | null;
  fecha: string;
  usuario_nombre: string;
}

// Cuenta completa del cliente: solo la ve el administrador.
export interface CuentaCliente {
  cliente: ClienteVenta & { telefono?: string | null; creado_en?: string };
  compras: CompraCliente[];
  movimientos: MovimientoFiado[];
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

export interface Cliente {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
  limite_fiado: string;
}

export interface SaldoFiado {
  cliente_id: number;
  nombre: string;
  telefono: string | null;
  limite_fiado: string;
  saldo_fiado: string;
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
