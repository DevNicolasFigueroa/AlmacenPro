-- Migración para bases de datos creadas antes de la spec 001.
-- Ejecutar UNA sola vez: mysql -u root -p almacenpro < database/migration_001_autenticacion.sql
-- Para bases nuevas no hace falta: database/schema.sql ya incluye estas columnas.

ALTER TABLE usuarios
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN venta_en_curso TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN requiere_cambio_contrasena TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN codigo_recuperacion_hash VARCHAR(100) NULL;
