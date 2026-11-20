-- Migración 002 para la spec 001 (bloqueo por intentos y ciclo de vida de la venta).
-- Ejecutar UNA sola vez: mysql -u root -p almacenpro < database/migration_002_spec001.sql
-- Para bases nuevas no hace falta: database/schema.sql ya incluye estos cambios.
-- La venta en curso deja de guardarse en usuarios: la fuente de verdad es ventas.estado.

ALTER TABLE usuarios
  ADD COLUMN intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN bloqueado_hasta DATETIME NULL,
  DROP COLUMN venta_en_curso;

ALTER TABLE ventas
  MODIFY COLUMN estado ENUM('en_curso', 'completada', 'anulada', 'cancelada_automaticamente')
    NOT NULL DEFAULT 'en_curso',
  ADD COLUMN iniciada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN cancelada_en DATETIME NULL;

CREATE INDEX idx_ventas_usuario_estado ON ventas (usuario_id, estado);
CREATE INDEX idx_ventas_estado_actividad ON ventas (estado, ultima_actividad);
