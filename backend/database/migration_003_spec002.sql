-- Migración 003 para la spec 002 (productos e inventario).
-- Ejecutar UNA sola vez: mysql -u root -p almacenpro < database/migration_003_spec002.sql
-- Para bases nuevas no hace falta: database/schema.sql ya incluye estos cambios.
-- Requiere MySQL 8.0.16 o superior (aplica las restricciones CHECK).
-- Haz un respaldo antes: mysqldump -u root -p almacenpro > respaldo.sql
--
-- Qué hace:
--   1. Se detiene si hay productos con stock negativo (RNF-1) o stock sin administrador
--      al que atribuir el "stock inicial".
--   2. Normaliza la unidad de medida a 'unidad' o 'kilo' (RF-7).
--   3. Convierte stock y stock_minimo a DECIMAL(10,3) y agrega CHECK (stock >= 0).
--   4. Crea movimientos_stock, el historial de solo inserción (RF-8, RF-26, RF-29).
--   5. Registra el stock existente como movimiento "stock inicial".

-- ------------------------------------------------------------
-- 1. Verificaciones previas: si algo falla, el script se detiene sin cambiar nada
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_verificar_migracion_003;

DELIMITER $$
CREATE PROCEDURE sp_verificar_migracion_003()
BEGIN
  IF EXISTS (SELECT 1 FROM productos WHERE stock < 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay productos con stock negativo. Corrígelos antes de migrar.';
  END IF;

  IF EXISTS (SELECT 1 FROM productos WHERE stock > 0)
     AND NOT EXISTS (SELECT 1 FROM usuarios WHERE rol = 'administrador') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No hay un administrador al que atribuir el stock inicial. Crea uno con npm run seed.';
  END IF;
END$$
DELIMITER ;

CALL sp_verificar_migracion_003();
DROP PROCEDURE sp_verificar_migracion_003;

-- ------------------------------------------------------------
-- 2. Unidades: cualquier valor previo pasa a 'unidad', salvo las variantes de kilo
-- ------------------------------------------------------------
UPDATE productos
SET unidad_medida = CASE
  WHEN LOWER(TRIM(unidad_medida)) IN ('kilo', 'kilos', 'kg', 'kilogramo', 'kilogramos') THEN 'kilo'
  ELSE 'unidad'
END;

UPDATE productos SET stock_minimo = 0 WHERE stock_minimo < 0;

-- ------------------------------------------------------------
-- 3. Tipos de columna y restricción de stock no negativo
-- ------------------------------------------------------------
ALTER TABLE productos
  MODIFY COLUMN stock         DECIMAL(10,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN stock_minimo  DECIMAL(10,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN unidad_medida ENUM('unidad', 'kilo') NOT NULL DEFAULT 'unidad',
  ADD CONSTRAINT chk_productos_stock_no_negativo CHECK (stock >= 0);

-- ------------------------------------------------------------
-- 4. Historial de movimientos de stock (solo se inserta, nunca se modifica)
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
-- 5. El stock que ya existía queda como "stock inicial" del primer administrador
-- ------------------------------------------------------------
INSERT INTO movimientos_stock
  (producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues, nota)
SELECT
  p.id,
  (SELECT u.id FROM usuarios u WHERE u.rol = 'administrador' ORDER BY u.id LIMIT 1),
  'stock_inicial',
  p.stock,
  0,
  p.stock,
  'Stock existente al migrar'
FROM productos p
WHERE p.stock > 0;
