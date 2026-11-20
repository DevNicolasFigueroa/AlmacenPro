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
}

export interface RespuestaVentaActiva {
  ventaActiva: VentaActiva | null;
  aviso: boolean;
  segundosParaCancelar: number;
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

export interface Producto {
  id: number;
  codigo_barras: string | null;
  nombre: string;
  descripcion: string | null;
  categoria_id: number | null;
  categoria: string | null;
  precio_costo?: string; // DECIMAL llega como string; solo para administradores (RF-12)
  precio_venta: string;
  stock: number;
  stock_minimo: number;
  unidad_medida: string;
  activo: number;
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

export interface DetalleVenta {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

export interface VentaNueva {
  cliente_id?: number | null;
  metodo_pago: 'efectivo' | 'debito' | 'credito' | 'fiado';
  detalles: DetalleVenta[];
}
