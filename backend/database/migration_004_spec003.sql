-- Migración 004 para la spec 003 (ventas, clientes por RUT y anulaciones).
-- Ejecutar UNA sola vez: mysql -u root -p almacenpro < database/migration_004_spec003.sql
-- Para bases nuevas no hace falta: database/schema.sql ya incluye estos cambios.
-- Requiere MySQL 8 o superior.
-- Haz un respaldo antes: mysqldump -u root -p almacenpro > respaldo.sql
--
-- Qué hace:
--   1. Se detiene, sin cambiar nada, si hay clientes sin RUT o con RUT repetido al
--      normalizarlo, productos repetidos dentro de una misma venta o cargos de fiado
--      duplicados para una venta.
--   2. Estados de la venta: agrega 'cancelada' (cancelación manual). Las ventas 'anulada'
--      que ya existían eran cancelaciones manuales (el administrador nunca pudo anular):
--      pasan a 'cancelada'.
--   3. Las ventas 'completada' SIN productos eran cierres de prueba de la spec 001 (sin
--      detalle, sin stock descontado): no son ventas y también pasan a 'cancelada'.
--   4. 'fecha' pasa a ser el momento de cierre: en las canceladas se copia cancelada_en.
--   5. Ventas: datos de la anulación (quién, cuándo y por qué) e índice (estado, fecha).
--   6. Detalle de ventas: cantidad con 3 decimales (kilos) y un producto por venta.
--   7. Clientes: el RUT es obligatorio y único (se guarda sin puntos); el nombre es opcional.
--   8. Fiado: nuevo tipo 'anulacion'; un cargo y una anulación por venta como máximo.
--   9. Recrea la vista v_saldo_fiado con el RUT: cargos - abonos - anulaciones.

-- ------------------------------------------------------------
-- 1. Verificaciones previas: si algo falla, el script se detiene sin cambiar nada
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_verificar_migracion_004;

DELIMITER $$
CREATE PROCEDURE sp_verificar_migracion_004()
BEGIN
  IF EXISTS (SELECT 1 FROM clientes WHERE rut IS NULL OR TRIM(rut) = '') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay clientes sin RUT. Agrégales su RUT antes de migrar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM clientes
    GROUP BY UPPER(REPLACE(REPLACE(TRIM(rut), '.', ''), ' ', ''))
    HAVING COUNT(*) > 1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay clientes con el mismo RUT escrito de forma distinta. Únelos antes de migrar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM detalle_ventas GROUP BY venta_id, producto_id HAVING COUNT(*) > 1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay ventas con el mismo producto repetido en varias líneas. Únelas antes de migrar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM fiado_transacciones
    WHERE venta_id IS NOT NULL
    GROUP BY venta_id, tipo HAVING COUNT(*) > 1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay ventas con más de un cargo de fiado del mismo tipo. Revísalas antes de migrar.';
  END IF;
END$$
DELIMITER ;

CALL sp_verificar_migracion_004();
DROP PROCEDURE sp_verificar_migracion_004;

-- ------------------------------------------------------------
-- 2 a 5. Ventas: estados, fecha de cierre y datos de la anulación
-- ------------------------------------------------------------
ALTER TABLE ventas
  MODIFY COLUMN estado
    ENUM('en_curso', 'completada', 'anulada', 'cancelada', 'cancelada_automaticamente')
    NOT NULL DEFAULT 'en_curso',
  ADD COLUMN anulada_por INT UNSIGNED NULL,
  ADD COLUMN anulada_en DATETIME NULL,
  ADD COLUMN motivo_anulacion VARCHAR(255) NULL,
  ADD CONSTRAINT fk_ventas_anulada_por FOREIGN KEY (anulada_por) REFERENCES usuarios (id);

-- Las 'anulada' existentes eran cancelaciones manuales (no guardaban cancelada_en).
UPDATE ventas
SET estado = 'cancelada',
    cancelada_en = COALESCE(cancelada_en, ultima_actividad)
WHERE estado = 'anulada';

-- 'completada' sin productos: cierres de prueba de la spec 001, no son ventas.
UPDATE ventas v
SET v.estado = 'cancelada',
    v.cancelada_en = COALESCE(v.cancelada_en, v.ultima_actividad)
WHERE v.estado = 'completada'
  AND NOT EXISTS (SELECT 1 FROM detalle_ventas d WHERE d.venta_id = v.id);

-- 'fecha' = momento de cierre.
UPDATE ventas
SET fecha = cancelada_en
WHERE estado IN ('cancelada', 'cancelada_automaticamente')
  AND cancelada_en IS NOT NULL;

CREATE INDEX idx_ventas_estado_fecha ON ventas (estado, fecha);

-- ------------------------------------------------------------
-- 6. Detalle de ventas: kilos con 3 decimales y un producto por venta
-- ------------------------------------------------------------
ALTER TABLE detalle_ventas
  MODIFY COLUMN cantidad DECIMAL(10,3) NOT NULL,
  ADD CONSTRAINT uq_detalle_venta_producto UNIQUE (venta_id, producto_id);

-- ------------------------------------------------------------
-- 7. Clientes: el RUT es el único identificador
-- ------------------------------------------------------------
UPDATE clientes
SET rut = UPPER(REPLACE(REPLACE(TRIM(rut), '.', ''), ' ', ''));

ALTER TABLE clientes
  MODIFY COLUMN rut    VARCHAR(12)  NOT NULL,
  MODIFY COLUMN nombre VARCHAR(150) NULL;

-- ------------------------------------------------------------
-- 8. Fiado: las anulaciones descuentan el cargo de una venta anulada
-- ------------------------------------------------------------
ALTER TABLE fiado_transacciones
  MODIFY COLUMN tipo ENUM('cargo', 'abono', 'anulacion') NOT NULL,
  ADD CONSTRAINT uq_fiado_venta_tipo UNIQUE (venta_id, tipo);

-- ------------------------------------------------------------
-- 9. Vista de saldo: cargos - abonos - anulaciones (negativo = saldo a favor)
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
                 ELSE 0
               END), 0) AS saldo_fiado
FROM clientes c
LEFT JOIN fiado_transacciones t ON t.cliente_id = c.id
GROUP BY c.id, c.rut, c.nombre, c.telefono, c.limite_fiado;
