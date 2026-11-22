# MEMORY.md — Memoria de proyecto AlmacenPro

Estado del proyecto registrado entre sesiones. Leer junto con `docs/CONSTITUTION.md`
y `AGENTS.md` antes de empezar cualquier tarea.

## 1. Estado actual

- Estructura monorepo inicializada: `backend/` (Express, ESM) y `frontend/` (React + TS + Vite).
- Base de datos MySQL configurada: 7 tablas del MVP (`usuarios`, `categorias`, `productos`,
  `clientes`, `ventas`, `detalle_ventas`, `fiado_transacciones`) y vista `v_saldo_fiado`.
- Autenticación completa según `specs/001-autenticacion-y-roles/spec.md` y su
  `plan.md` aprobado: login de 8 h, roles, bloqueo tras 5 intentos fallidos, desactivación y
  restablecimiento de cuentas (también de administradores, con la guarda de que siempre quede un
  administrador activo), contraseñas temporales, código de recuperación de un solo uso, cierre
  manual bloqueado al vender, aviso a los 10 min y cancelación automática a los 15 min de ventas
  abandonadas, gracia de JWT vencido mientras exista venta en curso e historial de canceladas.
  Sus pruebas forman parte de las unitarias y de integración actuales; `tsc --noEmit` y
  `vite build` sin errores.
- Productos e inventario completo según `specs/002-productos-e-inventario/` (rama
  `002-productos-e-inventario`): alta, edición y desactivación (sin borrado), stock en unidades o
  kilos con 3 decimales, ajuste manual con motivo (merma, reposición, corrección) en una transacción
  con `FOR UPDATE`, historial en `movimientos_stock` (solo inserción), estado agotado / stock bajo
  calculado en cada lectura, resumen de alertas en `/ventas` y vista del cajero sin costos.
  Migración 003 aplicada en `almacenpro`. 40 pruebas unitarias y 37 de integración (26 de esta
  spec) pasan contra MySQL real; checklist manual en navegador completado; con 5.000 productos
  el peor listado tardó 123 ms (límite 2 s).
- Constitución en `docs/CONSTITUTION.md` (6 principios innegociables). `npm run test:integracion`
  ya se ejecutó con MySQL real (cliente en `C:\Program Files\MySQL\MySQL Server 26.10\bin`).
- Ventas (punto de venta simple) completo según `specs/003-ventas-pos/` (rama `003-ventas-pos`): carrito
  en `detalle_ventas` de la venta en curso con precio congelado, búsqueda por nombre o código, total como suma
  de líneas redondeadas al peso, cobro en efectivo (con vuelto, no se guarda), débito, crédito y fiado, y
  confirmación en UNA transacción (venta + stock + movimientos + cargo de fiado) que rechaza toda la venta si
  falta stock. Cliente identificado solo por su RUT (se guarda sin puntos; nombre opcional), registrado desde la
  propia venta. Historial con filtro por fecha (completadas, anuladas y canceladas; solo las completadas
  suman), detalle y anulación por el administrador con motivo (devuelve stock, descuenta el fiado y puede
  dejar saldo a favor). Migración 004 creada (no aplicada en `almacenpro`). 76 pruebas unitarias y 65 de
  integración (28 de esta spec) pasan contra MySQL real; checklist manual hecho en el navegador sobre una base
  de pruebas; con 5.000 productos, 5.000 clientes y 50.000 ventas lo más lento fue 714 ms (historial de un
  año completo; límite 2 s).
- Clientes y fiado: la spec 004 está aprobada (rama `004-clientes-y-fiado`, sin código todavía): abonos,
  anulación de abonos (solo administrador), listado y búsqueda de clientes, edición de datos y corrección
  de RUT, con el Cajero viendo la cuenta completa. Reemplaza reglas de las specs 001 (RF-12, RF-13) y
  003 (RF-19, RF-23, RF-24) y el principio 5 de la constitución, que se actualizan al implementarla.
  Hasta entonces `GET /api/clientes` sigue con 501.
- Pendiente de implementar: `reportes` (su controlador sigue con 501).

## 2. Decisiones clave (y por qué)

- **Node.js con ESM + `mysql2` en modo promesa:** permite transacciones atómicas reales
  (`connection.beginTransaction()`) para que venta + descuento de stock + cargo fiado
  se apliquen juntas o no se apliquen.
- **Separación estricta de capas (`routes → controllers → models`):** el SQL vive solo en
  los modelos; los controladores validan y responden; facilita auditoría de datos comerciales.
- **Enfoque al comerciante chileno:** mensajes e interfaz 100% en español, RUT opcional
  en la interfaz, el RUT chileno como único identificador del cliente y montos en CLP; el dueño lee los
  errores sin ayuda técnica.
- **Anulación de ventas incluida en el MVP:** los errores de caja son frecuentes en un almacén. Solo el administrador puede anular; la anulación revierte stock y fiado en una sola transacción.
- **El RUT es el único identificador del cliente (spec 003):** se guarda sin puntos (`12345678-5`), es obligatorio
  y único; el nombre es opcional. Se pregunta en toda venta (opcional salvo en el fiado).
- **Fiado sin límite de crédito:** se muestra el saldo y se destaca "en deuda", pero nunca se bloquea la venta.
- **La anulación del fiado es un tipo propio (`anulacion`):** no se mezcla con los abonos (pagos reales).
  Conciliación: cargos − abonos − anulaciones = saldo. Si el cliente ya había abonado, queda saldo a favor.
- **`cancelada` no es `anulada`:** cancelada = no se concretó (a mano o por inactividad, queda con su carrito);
  anulada = una venta confirmada que el administrador corrigió. `ventas.fecha` es el momento de cierre.

## 3. Aprendizajes y errores a evitar

- (Nota preventiva) En las transacciones del POS: usar `SELECT ... FOR UPDATE` sobre
  productos antes de descontar stock, para evitar ventas simultáneas que dejen stock negativo.
- (Nota preventiva) Nunca calcular el total con el precio actual del producto: congelar
  `precio_unitario` en `detalle_ventas` al momento de la venta.
- (Nota preventiva) Verificar `estado = 'completada'` al reportar ventas; las anuladas
  no deben sumar al total ni al saldo de fiado.
- Toda transacción de venta, anulación o ajuste toma primero la fila de la venta y luego los productos
  ordenados por id (`bloquearPorIds`): así no se interbloquean. Verificado con ventas y ajustes simultáneos.
- El subtotal usa enteros y `BigInt` (`calcularSubtotal`): `precio * cantidad` en coma flotante da errores en
  el medio peso (0,35 kg × $1.590 = $556,5 → $557).
- En el frontend, `.boton` de `app.css` se carga después de los estilos de cada módulo: las variantes necesitan
  más especificidad (`.boton.boton--grande`). El campo de búsqueda no se deshabilita al guardar un cambio, o
  pierde el foco.
- Enter en el buscador debe consultar con lo que está escrito ahora, no con los resultados de la pausa
  anterior; si no, agrega el producto equivocado.

## 4. Próximos pasos inmediatos

- [x] Ejecutar `npm run test:integracion` contra MySQL real (migración 002, semilla, login y flujos de sesión).
- [x] Escribir la especificación del módulo de ventas (spec 003). Cierra los criterios de la spec 002 que
      dependían del punto de venta (retirar de la venta y vender y ajustar a la vez).
- [x] Implementar `ventas.controller.js` + `ventas.model.js` con transacción SQL (confirmar, anular, historial).
- [ ] Aplicar la migración 004 en la base real `almacenpro` (con respaldo antes): `database/migration_004_spec003.sql`.
- [x] Escribir la especificación de clientes y fiado (spec 004, aprobada): abonos, corregir un RUT, agregar
      nombre y contacto, listado con búsqueda. Sin límite de crédito ni desactivar clientes (fuera de alcance).
- [ ] Redactar `plan.md` y `tasks.md` de la spec 004 e implementarla.
- [ ] Escribir la especificación de reportes (ventas del día, ganancias, cierre de caja, stock bajo en el reporte).
- [ ] Actualizar esta memoria al terminar cada sesión.
- [x] Implementar ajuste manual de stock con motivo (merma, reposición, corrección); registrar el movimiento en la base de datos para auditoría.
- [x] Implementar alerta de stock bajo (mínimo configurable por producto) y mostrarla en el listado de productos. Falta mostrarla en el reporte del día (módulo de reportes).
