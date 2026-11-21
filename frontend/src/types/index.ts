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

export interface VentaCancelada {
  id: number;
  fecha: string;
  iniciada_en: string;
  ultima_actividad: string;
  cancelada_en: string;
  total: string;
  usuario_id: number;
  cajero_nombre: string;
  cajero_usuario: string;
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
