# MEMORY.md — Memoria de proyecto AlmacenPro

Estado del proyecto registrado entre sesiones. Leer junto con `docs/constitution.md`
y `AGENTS.md` antes de empezar cualquier tarea.

## 1. Estado actual

- Estructura monorepo inicializada: `backend/` (Express, ESM) y `frontend/` (React + TS + Vite).
- Base de datos MySQL configurada: 7 tablas del MVP (`usuarios`, `categorias`, `productos`,
  `clientes`, `ventas`, `detalle_ventas`, `fiado_transacciones`) y vista `v_saldo_fiado`.
- Autenticación completa según `specs/001-autenticacion-y-roles/spec.md` y su
  `plan.md` aprobado: login de 8 h, roles, bloqueo tras 5 intentos fallidos, cuentas
  permanentes de administrador, desactivación de cajeros, contraseñas temporales,
  código de recuperación de un solo uso, cierre manual bloqueado al vender,
  aviso a los 10 min y cancelación automática a los 15 min de ventas abandonadas,
  gracia de JWT vencido mientras exista venta en curso e historial de canceladas.
  13 pruebas unitarias pasan; `tsc --noEmit` y `vite build` sin errores.
- Constitución en `docs/constitution.md` (6 principios innegociables). No hay cliente MySQL
  en este entorno: `npm run test:integracion` existe pero falta ejecutarlo con MySQL real.
- Pendiente de implementar: registro transaccional de `ventas`, `clientes/fiado` y `reportes`
  (sus controladores siguen con 501). El ciclo de venta sí opera:
  `/ventas/iniciar`, `/ventas/:id/actividad`, `/ventas/:id/finalizar`, `/ventas/:id/cancelar`.

## 2. Decisiones clave (y por qué)

- **Node.js con ESM + `mysql2` en modo promesa:** permite transacciones atómicas reales
  (`connection.beginTransaction()`) para que venta + descuento de stock + cargo fiado
  se apliquen juntas o no se apliquen.
- **Separación estricta de capas (`routes → controllers → models`):** el SQL vive solo en
  los modelos; los controladores validan y responden; facilita auditoría de datos comerciales.
- **Enfoque al comerciante chileno:** mensajes e interfaz 100% en español, RUT opcional
  en clientes, montos en CLP; el dueño lee los errores sin ayuda técnica.
- **Anulación de ventas incluida en el MVP:** los errores de caja son frecuentes en un almacén. Solo el administrador puede anular; la anulación revierte stock y fiado en una sola transacción.

## 3. Aprendizajes y errores a evitar

- (Nota preventiva) En las transacciones del POS: usar `SELECT ... FOR UPDATE` sobre
  productos antes de descontar stock, para evitar ventas simultáneas que dejen stock negativo.
- (Nota preventiva) Nunca calcular el total con el precio actual del producto: congelar
  `precio_unitario` en `detalle_ventas` al momento de la venta.
- (Nota preventiva) Verificar `estado = 'completada'` al reportar ventas; las anuladas
  no deben sumar al total ni al saldo de fiado.

## 4. Próximos pasos inmediatos

- [ ] Ejecutar `npm run test:integracion` contra MySQL real (migración 002, semilla, login y flujos de sesión).
- [ ] Escribir la especificación del módulo de ventas (principio 2 de la constitución).
- [ ] Implementar `ventas.controller.js` + `ventas.model.js` con transacción SQL:
      validar stock (FOR UPDATE) → descontar → insertar venta y detalles → cargo fiado
      si `metodo_pago = 'fiado'`. Rollback ante cualquier fallo.
- [ ] Actualizar esta memoria al terminar cada sesión.
- [ ] Implementar ajuste manual de stock con motivo (merma, reposición, corrección); registrar el movimiento en la base de datos para auditoría.
- [ ] Implementar alerta de stock bajo (mínimo configurable por producto) y mostrarla en el listado de productos y en el reporte del día.
