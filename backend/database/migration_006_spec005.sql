-- Migración 006 para la spec 005 (reportes y cierre de caja).
-- Ejecutar UNA sola vez: mysql -u root -p almacenpro < database/migration_006_spec005.sql
-- Para bases nuevas no hace falta: database/schema.sql ya incluye estos cambios.
-- Requiere MySQL 8 o superior y la migración 005 aplicada antes.
-- Haz un respaldo antes: mysqldump -u root -p almacenpro > respaldo.sql
--
-- Qué hace (no cambia ningún dato existente):
--   1. Detalle de ventas: agrega costo_unitario, el costo del producto congelado al confirmar la
--      venta. Queda NULO en las ventas anteriores: no se inventa un costo para ellas.
--   2. Crea cierres_caja: constancia de lo contado al cerrar el turno de una persona (solo se
--      inserta). Un índice único impide cerrar dos veces el mismo turno.
--   3. Agrega índices para consultar por período y por persona con muchas ventas y abonos.

-- ------------------------------------------------------------
-- 1. Costo congelado de cada línea vendida
-- ------------------------------------------------------------
ALTER TABLE detalle_ventas
  ADD COLUMN costo_unitario DECIMAL(11,2) NULL AFTER precio_unitario,
  ADD CONSTRAINT chk_detalle_costo_no_negativo CHECK (costo_unitario IS NULL OR costo_unitario >= 0);

-- ------------------------------------------------------------
-- 2. Cierres de caja
-- ------------------------------------------------------------
CREATE TABLE cierres_caja (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id          INT UNSIGNED  NOT NULL,         -- persona que cierra su turno
  cierre_anterior_id  INT UNSIGNED  NULL,             -- su cierre anterior; nulo en el primero
  turno_clave         INT UNSIGNED AS (IFNULL(cierre_anterior_id, 0)) STORED, -- para el índice único (el nulo no choca)
  desde               DATETIME      NULL,             -- inicio del turno; nulo si no hubo movimientos
  cerrado_en          DATETIME      NOT NULL,
  fondo_inicial       DECIMAL(11,2) NOT NULL,
  efectivo_contado    DECIMAL(11,2) NOT NULL,
  efectivo_esperado   DECIMAL(11,2) NOT NULL,         -- fondo + ventas y abonos en efectivo - efectivo devuelto
  diferencia          DECIMAL(11,2) NOT NULL,         -- contado - esperado: positiva sobra, negativa falta
  efectivo_devuelto   DECIMAL(11,2) NOT NULL DEFAULT 0, -- anulaciones hechas en el turno de algo ya cerrado
  cantidad_ventas     INT UNSIGNED  NOT NULL DEFAULT 0,
  ventas_efectivo     DECIMAL(11,2) NOT NULL DEFAULT 0,
  ventas_debito       DECIMAL(11,2) NOT NULL DEFAULT 0,
  ventas_credito      DECIMAL(11,2) NOT NULL DEFAULT 0,
  ventas_fiado        DECIMAL(11,2) NOT NULL DEFAULT 0,
  abonos_efectivo     DECIMAL(11,2) NOT NULL DEFAULT 0,
  abonos_debito       DECIMAL(11,2) NOT NULL DEFAULT 0,
  abonos_credito      DECIMAL(11,2) NOT NULL DEFAULT 0,
  abonos_transferencia DECIMAL(11,2) NOT NULL DEFAULT 0,
  observacion         VARCHAR(255)  NULL,
  CONSTRAINT uq_cierre_turno UNIQUE (usuario_id, turno_clave), -- un turno se cierra una sola vez
  CONSTRAINT chk_cierre_montos_no_negativos CHECK (
    fondo_inicial >= 0 AND efectivo_contado >= 0 AND efectivo_devuelto >= 0
    AND ventas_efectivo >= 0 AND ventas_debito >= 0 AND ventas_credito >= 0 AND ventas_fiado >= 0
    AND abonos_efectivo >= 0 AND abonos_debito >= 0 AND abonos_credito >= 0 AND abonos_transferencia >= 0
  ),
  CONSTRAINT fk_cierres_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT fk_cierres_anterior
    FOREIGN KEY (cierre_anterior_id) REFERENCES cierres_caja (id)
) ENGINE = InnoDB;

CREATE INDEX idx_cierres_usuario_fecha ON cierres_caja (usuario_id, cerrado_en);
CREATE INDEX idx_cierres_fecha ON cierres_caja (cerrado_en);

-- ------------------------------------------------------------
-- 3. Índices para los períodos y los turnos
-- ------------------------------------------------------------
CREATE INDEX idx_ventas_usuario_fecha ON ventas (usuario_id, fecha);
CREATE INDEX idx_fiado_tipo_fecha ON fiado_transacciones (tipo, fecha);
CREATE INDEX idx_fiado_usuario_fecha ON fiado_transacciones (usuario_id, fecha);
