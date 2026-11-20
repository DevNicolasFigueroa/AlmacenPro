-- ============================================================
-- AlmacenPro - Esquema de base de datos (MVP)
-- Motor: MySQL 8+  |  Juego de caracteres: utf8mb4
-- Ejecutar con:  mysql -u root -p < database/schema.sql
-- Nota: los montos usan DECIMAL(11,2) por flexibilidad;
--       en Chile los precios CLP se registran sin decimales.
-- ============================================================

CREATE DATABASE IF NOT EXISTS almacenpro
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE almacenpro;

-- ------------------------------------------------------------
-- Usuarios del sistema (administrador y cajero)
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  usuario       VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,                -- bcrypt
  rol           ENUM('administrador', 'cajero') NOT NULL DEFAULT 'cajero',
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0, -- RF-7: ingreso bloqueado tras 5 fallos
  bloqueado_hasta DATETIME   NULL,                 -- RF-7: fin del bloqueo de 15 minutos
  token_version INT UNSIGNED NOT NULL DEFAULT 0,   -- invalida sesiones al cerrar o cambiar contraseña
  requiere_cambio_contrasena TINYINT(1) NOT NULL DEFAULT 0, -- contraseña temporal de cajero
  codigo_recuperacion_hash VARCHAR(100) NULL,      -- bcrypt del código de un solo uso del administrador
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Categorías de productos
-- ------------------------------------------------------------
CREATE TABLE categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(80) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NULL
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Productos e inventario
-- ------------------------------------------------------------
CREATE TABLE productos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_barras VARCHAR(20) NULL UNIQUE,              -- opcional, escáner en el POS
  nombre        VARCHAR(150) NOT NULL,
  descripcion   VARCHAR(255) NULL,
  categoria_id  INT UNSIGNED NULL,
  precio_costo  DECIMAL(11,2) NOT NULL DEFAULT 0,
  precio_venta  DECIMAL(11,2) NOT NULL DEFAULT 0,
  stock         INT           NOT NULL DEFAULT 0,
  stock_minimo  INT           NOT NULL DEFAULT 0,     -- umbral para alertas de reposición
  unidad_medida VARCHAR(20)   NOT NULL DEFAULT 'unidad',
  activo        TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_productos_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON DELETE SET NULL
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Clientes (fiado / cuenta corriente)
-- ------------------------------------------------------------
CREATE TABLE clientes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rut          VARCHAR(12) NULL UNIQUE,               -- opcional, formato chileno 12.345.678-5
  nombre       VARCHAR(150) NOT NULL,
  telefono     VARCHAR(20) NULL,
  email        VARCHAR(120) NULL,
  direccion    VARCHAR(200) NULL,
  limite_fiado DECIMAL(11,2) NOT NULL DEFAULT 0,      -- 0 = sin crédito habilitado
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Ventas (una fila por boleta/venta del POS)
-- ------------------------------------------------------------
CREATE TABLE ventas (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,                  -- cajero/administrador que vendió
  cliente_id  INT UNSIGNED NULL,                      -- solo si la venta es al fiado
  fecha       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total       DECIMAL(11,2) NOT NULL DEFAULT 0,
  metodo_pago ENUM('efectivo', 'debito', 'credito', 'fiado') NOT NULL DEFAULT 'efectivo',
  estado      ENUM('en_curso', 'completada', 'anulada', 'cancelada_automaticamente')
                NOT NULL DEFAULT 'en_curso',       -- RF-24, RF-25, RF-28
  iniciada_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- RF-24, RF-25
  cancelada_en DATETIME     NULL,                  -- RF-25, RF-28
  CONSTRAINT fk_ventas_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT fk_ventas_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE INDEX idx_ventas_fecha          ON ventas (fecha);
CREATE INDEX idx_ventas_cliente        ON ventas (cliente_id);
CREATE INDEX idx_ventas_usuario_estado ON ventas (usuario_id, estado);
CREATE INDEX idx_ventas_estado_actividad ON ventas (estado, ultima_actividad);

-- ------------------------------------------------------------
-- Detalle de ventas (una fila por producto vendido)
-- ------------------------------------------------------------
CREATE TABLE detalle_ventas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_id        INT UNSIGNED   NOT NULL,
  producto_id     INT UNSIGNED   NOT NULL,
  cantidad        INT            NOT NULL,
  precio_unitario DECIMAL(11,2)  NOT NULL,            -- precio al momento de la venta
  subtotal        DECIMAL(11,2)  NOT NULL,
  CONSTRAINT fk_detalle_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_detalle_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Transacciones de fiado: cargos (ventas al fiado) y abonos (pagos)
-- ------------------------------------------------------------
CREATE TABLE fiado_transacciones (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id  INT UNSIGNED NOT NULL,
  venta_id    INT UNSIGNED NULL,                      -- carga al vender al fiado
  usuario_id  INT UNSIGNED NOT NULL,                  -- usuario que registra el movimiento
  tipo        ENUM('cargo', 'abono') NOT NULL,
  monto       DECIMAL(11,2) NOT NULL,
  observacion VARCHAR(255) NULL,                      -- ej: "Abono $10.000 efectivo"
  fecha       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fiado_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT fk_fiado_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_fiado_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE = InnoDB;

CREATE INDEX idx_fiado_cliente ON fiado_transacciones (cliente_id);

-- ------------------------------------------------------------
-- Vista: saldo de fiado por cliente (consulta rápida "de un vistazo")
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_saldo_fiado AS
SELECT
  c.id AS cliente_id,
  c.nombre,
  c.telefono,
  c.limite_fiado,
  COALESCE(SUM(CASE WHEN t.tipo = 'cargo' THEN t.monto ELSE -t.monto END), 0) AS saldo_fiado
FROM clientes c
LEFT JOIN fiado_transacciones t ON t.cliente_id = c.id
GROUP BY c.id, c.nombre, c.telefono, c.limite_fiado;

-- ------------------------------------------------------------
-- Categorías iniciales típicas de un almacén chileno
-- ------------------------------------------------------------
INSERT INTO categorias (nombre) VALUES
  ('Abarrotes'),
  ('Bebidas'),
  ('Lácteos'),
  ('Panadería'),
  ('Limpieza'),
  ('Cigarrillos'),
  ('Golosinas'),
  ('Congelados');
