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
  stock         DECIMAL(10,3) NOT NULL DEFAULT 0,     -- kilos con hasta 3 decimales
  stock_minimo  DECIMAL(10,3) NOT NULL DEFAULT 0,     -- umbral para alertas de reposición (0 = sin alerta)
  unidad_medida ENUM('unidad', 'kilo') NOT NULL DEFAULT 'unidad',
  activo        TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_productos_stock_no_negativo CHECK (stock >= 0),  -- principio 5 de la constitución
  CONSTRAINT fk_productos_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON DELETE SET NULL
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Clientes (fiado / cuenta corriente)
-- ------------------------------------------------------------
CREATE TABLE clientes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rut          VARCHAR(12) NOT NULL UNIQUE,           -- único identificador; se guarda sin puntos: 12345678-5
  nombre       VARCHAR(150) NULL,                     -- opcional: el cliente puede existir solo con su RUT
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
  cliente_id  INT UNSIGNED NULL,                      -- cliente identificado por su RUT (obligatorio en el fiado)
  fecha       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP, -- momento de cierre: al confirmar o cancelar se actualiza
  total       DECIMAL(11,2) NOT NULL DEFAULT 0,
  metodo_pago ENUM('efectivo', 'debito', 'credito', 'fiado') NOT NULL DEFAULT 'efectivo',
  estado      ENUM('en_curso', 'completada', 'anulada', 'cancelada', 'cancelada_automaticamente')
                NOT NULL DEFAULT 'en_curso',       -- cancelada: no se concretó; anulada: corrección del administrador
  iniciada_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- RF-24, RF-25
  cancelada_en DATETIME     NULL,                  -- cancelada a mano o por inactividad
  anulada_por  INT UNSIGNED NULL,                  -- administrador que anuló la venta
  anulada_en   DATETIME     NULL,
  motivo_anulacion VARCHAR(255) NULL,
  CONSTRAINT fk_ventas_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT fk_ventas_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_ventas_anulada_por
    FOREIGN KEY (anulada_por) REFERENCES usuarios (id)
) ENGINE = InnoDB;

CREATE INDEX idx_ventas_fecha          ON ventas (fecha);
CREATE INDEX idx_ventas_estado_fecha   ON ventas (estado, fecha);
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
  cantidad        DECIMAL(10,3)  NOT NULL,            -- kilos con hasta 3 decimales
  precio_unitario DECIMAL(11,2)  NOT NULL,            -- precio congelado al agregar el producto
  subtotal        DECIMAL(11,2)  NOT NULL,            -- precio por cantidad, redondeado al peso
  CONSTRAINT uq_detalle_venta_producto UNIQUE (venta_id, producto_id), -- un producto, una línea
  CONSTRAINT fk_detalle_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_detalle_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- Historial de movimientos de stock (solo se inserta, nunca se modifica)
-- ------------------------------------------------------------
CREATE TABLE movimientos_stock (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id  INT UNSIGNED  NOT NULL,
  usuario_id   INT UNSIGNED  NOT NULL,                -- cuenta que hizo el movimiento
  tipo         ENUM('stock_inicial', 'merma', 'reposicion', 'correccion', 'venta', 'anulacion_venta')
                 NOT NULL,                            -- venta y anulacion_venta los usa la spec de ventas
  cantidad     DECIMAL(10,3) NOT NULL,                -- diferencia con signo: positiva suma, negativa resta
  stock_antes  DECIMAL(10,3) NOT NULL,
  stock_despues DECIMAL(10,3) NOT NULL,
  nota         VARCHAR(255)  NULL,
  venta_id     INT UNSIGNED  NULL,                    -- solo en venta y anulacion_venta
  creado_en    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movimientos_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id),
  CONSTRAINT fk_movimientos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT fk_movimientos_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE INDEX idx_movimientos_producto_fecha ON movimientos_stock (producto_id, creado_en);

-- ------------------------------------------------------------
-- Transacciones de fiado: cargos (ventas al fiado), abonos (pagos), anulaciones de venta
-- (deshacen el cargo de una venta anulada; no son pagos del cliente) y anulaciones de abono
-- (deshacen un abono mal registrado).
-- Solo se inserta, nunca se modifica.
-- ------------------------------------------------------------
CREATE TABLE fiado_transacciones (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id  INT UNSIGNED NOT NULL,
  venta_id    INT UNSIGNED NULL,                      -- cargo y anulación de una venta; nulo en los abonos
  abono_anulado_id INT UNSIGNED NULL,                 -- solo en la anulación de abono: el abono que deshace
  usuario_id  INT UNSIGNED NOT NULL,                  -- usuario que registra el movimiento
  tipo        ENUM('cargo', 'abono', 'anulacion', 'anulacion_abono') NOT NULL,
  monto       DECIMAL(11,2) NOT NULL,
  metodo_pago ENUM('efectivo', 'debito', 'credito', 'transferencia') NULL, -- solo en los abonos
  observacion VARCHAR(255) NULL,                      -- observación del abono o motivo de su anulación
  fecha       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_fiado_venta_tipo UNIQUE (venta_id, tipo), -- un cargo y una anulación por venta, como máximo
  CONSTRAINT uq_fiado_abono_anulado UNIQUE (abono_anulado_id), -- un abono se anula una sola vez
  CONSTRAINT chk_fiado_monto_positivo CHECK (monto > 0),
  CONSTRAINT chk_fiado_anulacion_abono CHECK (
    (tipo = 'anulacion_abono' AND abono_anulado_id IS NOT NULL)
    OR (tipo <> 'anulacion_abono' AND abono_anulado_id IS NULL)
  ),
  CONSTRAINT fk_fiado_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT fk_fiado_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_fiado_abono_anulado
    FOREIGN KEY (abono_anulado_id) REFERENCES fiado_transacciones (id),
  CONSTRAINT fk_fiado_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE = InnoDB;

CREATE INDEX idx_fiado_cliente ON fiado_transacciones (cliente_id);

-- ------------------------------------------------------------
-- Cambios de RUT: constancia de quién corrigió el RUT de un cliente, cuándo y de cuál a cuál.
-- Solo se inserta, nunca se modifica.
-- ------------------------------------------------------------
CREATE TABLE cambios_rut (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id   INT UNSIGNED NOT NULL,
  rut_anterior VARCHAR(12)  NOT NULL,
  rut_nuevo    VARCHAR(12)  NOT NULL,
  usuario_id   INT UNSIGNED NOT NULL,                 -- cuenta que corrigió el RUT
  creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cambios_rut_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT fk_cambios_rut_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE = InnoDB;

CREATE INDEX idx_cambios_rut_cliente ON cambios_rut (cliente_id, creado_en);

-- ------------------------------------------------------------
-- Vista: saldo de fiado por cliente (consulta rápida "de un vistazo")
-- Saldo = cargos - abonos - anulaciones de venta + anulaciones de abono.
-- Negativo = saldo a favor del cliente.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_saldo_fiado AS
SELECT
  c.id AS cliente_id,
  c.rut,
  c.nombre,
  c.telefono,
  c.limite_fiado,
  COALESCE(SUM(CASE t.tipo
                 WHEN 'cargo' THEN t.monto
                 WHEN 'abono' THEN -t.monto
                 WHEN 'anulacion' THEN -t.monto
                 WHEN 'anulacion_abono' THEN t.monto
                 ELSE 0
               END), 0) AS saldo_fiado
FROM clientes c
LEFT JOIN fiado_transacciones t ON t.cliente_id = c.id
GROUP BY c.id, c.rut, c.nombre, c.telefono, c.limite_fiado;

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
