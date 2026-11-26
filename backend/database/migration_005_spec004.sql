-- Migración 005 para la spec 004 (clientes y fiado: abonos, anulación de abonos y cambios de RUT).
-- Ejecutar UNA sola vez: mysql -u root -p almacenpro < database/migration_005_spec004.sql
-- Para bases nuevas no hace falta: database/schema.sql ya incluye estos cambios.
-- Requiere MySQL 8 o superior y la migración 004 aplicada antes.
-- Haz un respaldo antes: mysqldump -u root -p almacenpro > respaldo.sql
--
-- Qué hace:
--   1. Se detiene, sin cambiar nada, si hay movimientos de fiado con monto cero o negativo.
--   2. Fiado: nuevo tipo 'anulacion_abono' (deshace un abono mal registrado), el método de pago
--      del abono, la referencia al abono anulado (una sola anulación por abono) y reglas que
--      impiden montos no positivos y referencias inconsistentes. No cambia ningún movimiento
--      existente: los abonos anteriores quedan sin método de pago.
--   3. Crea cambios_rut: constancia de cada corrección de RUT (solo se inserta).
--   4. Recrea la vista v_saldo_fiado: cargos - abonos - anulaciones de venta + anulaciones de abono.
--      Los saldos de los clientes no cambian mientras no existan anulaciones de abono.

-- ------------------------------------------------------------
-- 1. Verificaciones previas: si algo falla, el script se detiene sin cambiar nada
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_verificar_migracion_005;

DELIMITER $$
CREATE PROCEDURE sp_verificar_migracion_005()
BEGIN
  IF EXISTS (SELECT 1 FROM fiado_transacciones WHERE monto <= 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay movimientos de fiado con monto cero o negativo. Revísalos antes de migrar.';
  END IF;
END$$
DELIMITER ;

CALL sp_verificar_migracion_005();
DROP PROCEDURE sp_verificar_migracion_005;

-- ------------------------------------------------------------
-- 2. Fiado: anulación de abonos y método de pago del abono
-- ------------------------------------------------------------
ALTER TABLE fiado_transacciones
  MODIFY COLUMN tipo ENUM('cargo', 'abono', 'anulacion', 'anulacion_abono') NOT NULL,
  ADD COLUMN metodo_pago ENUM('efectivo', 'debito', 'credito', 'transferencia') NULL AFTER monto,
  ADD COLUMN abono_anulado_id INT UNSIGNED NULL AFTER venta_id,
  ADD CONSTRAINT uq_fiado_abono_anulado UNIQUE (abono_anulado_id),
  ADD CONSTRAINT fk_fiado_abono_anulado
    FOREIGN KEY (abono_anulado_id) REFERENCES fiado_transacciones (id),
  ADD CONSTRAINT chk_fiado_monto_positivo CHECK (monto > 0),
  ADD CONSTRAINT chk_fiado_anulacion_abono CHECK (
    (tipo = 'anulacion_abono' AND abono_anulado_id IS NOT NULL)
    OR (tipo <> 'anulacion_abono' AND abono_anulado_id IS NULL)
  );

-- ------------------------------------------------------------
-- 3. Cambios de RUT: constancia inalterable de quién, cuándo, RUT anterior y RUT nuevo
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
-- 4. Vista de saldo: la anulación de un abono vuelve a sumar el monto a la deuda
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
