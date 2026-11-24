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
  dejar saldo a favor). Migración 004 aplicada en `almacenpro` (2026-11-23). 76 pruebas unitarias y 65 de
  integración (28 de esta spec) pasan contra MySQL real; checklist manual hecho en el navegador sobre una base
  de pruebas; con 5.000 productos, 5.000 clientes y 50.000 ventas lo más lento fue 714 ms (historial de un
  año completo; límite 2 s).
- Clientes y fiado completo según `specs/004-clientes-y-fiado/` (rama `004-clientes-y-fiado`, 12 tareas con un
  commit cada una): listado de 25 por página con búsqueda (RUT con o sin puntos y guion, parcial; nombre sin
  importar mayúsculas ni tildes), filtro por estado y orden por nombre o deuda; total por cobrar solo para el
  administrador; cuenta del cliente con compras (y su detalle sin costos), movimientos y contacto, visible para el
  cajero; abonos generales (efectivo, débito, crédito o transferencia) con confirmación si superan la deuda
  (queda saldo a favor); anulación de abonos solo por el administrador, con motivo y sin plazo (movimiento nuevo
  `anulacion_abono`: el abono no se toca); edición de nombre, teléfono, correo y dirección; corrección del RUT con
  confirmación y constancia en `cambios_rut` (visible solo para el administrador, sin fusionar cuentas); la cuenta
  se abre desde el cobro de la venta sin perder el carrito. Reemplazó reglas de las specs 001 (RF-12, RF-13) y
  003 (RF-19, RF-23, RF-24, RF-38) y el principio 5 de la constitución. Migración 005 aplicada en
  `almacenpro` (2026-11-23). 100 pruebas unitarias y 93 de integración (26 de esta spec) pasan contra MySQL real; checklist
  manual hecho en el navegador sobre una base de pruebas; con 5.000 clientes, 50.000 ventas y 21.000 movimientos
  de fiado lo más lento fue 179 ms (límite 2 s).
- Reportes y cierre de caja completo según `specs/005-reportes/` (rama `005-reportes`, 11 tareas con un commit cada
  una): el costo de cada producto queda congelado en cada línea al confirmar la venta (`detalle_ventas.costo_unitario`,
  nulo en las ventas anteriores, que se informan aparte y no entran a la ganancia); reportes solo del administrador
  (ventas por período con desglose por método, cajero y día, vendido contra cobrado, ganancias por producto, más
  vendidos por monto y por reponer); cierre de caja de cada persona por turno, con fondo inicial y efectivo contado a
  ciegas (la pantalla no muestra el esperado hasta confirmar), guardado en `cierres_caja` (solo se inserta; una
  anulación posterior no lo cambia y el efectivo devuelto se descuenta en el turno de quien anula, solo si lo
  anulado ya estaba en un cierre); el cajero cierra su turno y ve solo sus cierres, el administrador ve todos y los
  turnos sin cerrar. Migración 006 creada (no aplicada en `almacenpro`). 126 pruebas unitarias y 127 de integración
  (34 de esta spec) pasan contra MySQL real; checklist manual hecho en el navegador sobre una base de pruebas; con
  50.000 ventas, 5.000 productos y 20.000 movimientos de fiado lo más lento fue 255 ms (límite 2 s).
- Pendiente de implementar: nada de las especificaciones aprobadas; faltan despliegue y las ideas fuera de alcance.

## 2. Decisiones clave (y por qué)

- **Node.js con ESM + `mysql2` en modo promesa:** permite transacciones atómicas reales
  (`connection.beginTransaction()`) para que venta + descuento de stock + cargo fiado
  se apliquen juntas o no se apliquen.
- **Separación estricta de capas (`routes → controllers → models`):** el SQL vive solo en
  los modelos; los controladores validan y responden; facilita auditoría de datos comerciales.
- **Enfoque al comerciante chileno:** mensajes e interfaz 100% en español, el RUT chileno como único
  identificador del cliente y montos en CLP; el dueño lee los errores sin ayuda técnica.
- **Anulación de ventas incluida en el MVP:** los errores de caja son frecuentes en un almacén. Solo el administrador puede anular; la anulación revierte stock y fiado en una sola transacción.
- **El RUT es el único identificador del cliente (spec 003):** se guarda sin puntos (`12345678-5`), es obligatorio
  y único; el nombre es opcional. Se pregunta en toda venta (opcional salvo en el fiado).
- **Fiado sin límite de crédito:** se muestra el saldo y se destaca "en deuda", pero nunca se bloquea la venta.
- **La anulación del fiado es un tipo propio (`anulacion`):** no se mezcla con los abonos (pagos reales).
  Conciliación: cargos − abonos − anulaciones de venta + anulaciones de abono = saldo. Si el cliente ya había
  abonado, queda saldo a favor.
- **Spec 004, el Cajero atiende al cliente:** por decisión del dueño, el cajero ve la cuenta completa (incluido el
  detalle de cada compra del cliente), registra abonos y corrige datos y RUT. Solo el administrador anula abonos y
  ventas y ve el total por cobrar y los cambios de RUT. Los abonos son generales (no se asignan a una venta) y
  no hay límite de crédito ni desactivación de clientes.
- **Una anulación de abono es un movimiento nuevo (`anulacion_abono`) con `UNIQUE (abono_anulado_id)`:** el abono
  queda visible y marcado como anulado; el saldo siempre se deriva de los movimientos, nunca se guarda.
- **Corregir un RUT cambia la columna del cliente:** compras, fiados y saldo cuelgan de `cliente_id`, así que no se
  copia nada. Sin `confirmar: true` el servidor solo avisa; un RUT ya usado se rechaza (no hay fusión).
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
- Las operaciones que cambian una cuenta de fiado (abono, anulación de abono, cambio de RUT) bloquean primero la
  fila del cliente con `FOR UPDATE` y recalculan el saldo dentro de la transacción: la advertencia de saldo a favor
  se decide con el saldo real, no con el que mostraba la pantalla. Verificado con abonos y anulaciones simultáneos.
- El RUT se guarda con guion (`12345678-5`): para buscarlo sin guion se compara con `REPLACE(rut, '-', '')`.
  La prueba de integración lo detectó; la prueba unitaria sola no.
- Los modales se dibujan en el `<body>` (`createPortal`) y Escape cierra solo el de más arriba: la cuenta del
  cliente se abre sobre el cobro de la venta. Con otra ventana encima, los atajos numéricos del cobro se ignoran.
- El cierre de caja compara fechas por segundo (las columnas guardan segundos enteros y MySQL redondea al más
  cercano): `cerrar`, el turno y los turnos sin cerrar redondean la hora de corte de la misma manera (truncarla
  mientras la anulación se guarda redondeada dio un fallo intermitente: una anulación a las :10,7 quedaba en :11 y un
  cierre a las :11,8 en :11, y parecían simultáneos). Las pruebas separan por 1,1 s los hechos que dependen de su
  orden y sus fechas se redondean igual; un movimiento y un cierre en el mismo segundo se leen como simultáneos.
- Al sembrar datos de prueba con consultas recursivas, el cambio de hora de septiembre deja una hora local que no
  existe y MySQL rechaza la fecha: las bases de rendimiento se siembran con la conexión en UTC (`SET time_zone`).
- Los endpoints nuevos de lectura (`/reportes/*`, `/cierres-caja/*`) quedan fuera de la lista blanca de una cuenta
  desactivada con venta en curso: solo puede terminar o cancelar su venta; su turno se ve como "sin cerrar".
- En las pruebas de integración, los nombres de los datos de prueba no deben contener palabras que otra prueba
  busque en las respuestas (por ejemplo "costo"): dos pruebas fallaron por eso.

## 4. Próximos pasos inmediatos

- [x] Ejecutar `npm run test:integracion` contra MySQL real (migración 002, semilla, login y flujos de sesión).
- [x] Escribir la especificación del módulo de ventas (spec 003). Cierra los criterios de la spec 002 que
      dependían del punto de venta (retirar de la venta y vender y ajustar a la vez).
- [x] Implementar `ventas.controller.js` + `ventas.model.js` con transacción SQL (confirmar, anular, historial).
- [x] Aplicar las migraciones 004 y 005 en la base real `almacenpro` (2026-11-23, con respaldo previo fuera del
      proyecto). La estructura de `almacenpro` quedó idéntica a `database/schema.sql` (columnas, reglas, índices,
      claves foráneas y vista). Las 4 ventas `anulada`/`completada` sin productos pasaron a `cancelada`; no hubo
      movimientos de fiado que migrar.
- [x] Escribir la especificación de clientes y fiado (spec 004, aprobada): abonos, corregir un RUT, agregar
      nombre y contacto, listado con búsqueda. Sin límite de crédito ni desactivar clientes (fuera de alcance).
- [x] Redactar `plan.md` y `tasks.md` de la spec 004 e implementarla (12 tareas, T1 a T12).
- [x] Fusionar la rama `004-clientes-y-fiado` en `develop` (avance rápido) y subir `develop` y la rama
      `003-ventas-pos` a origin.
- [x] Escribir e implementar la especificación de reportes y cierre de caja (spec 005, 11 tareas).
- [ ] Aplicar la migración 006 en `almacenpro` (con respaldo previo) y fusionar la rama `005-reportes` en `develop`.
- [ ] Actualizar esta memoria al terminar cada sesión.
- [x] Implementar ajuste manual de stock con motivo (merma, reposición, corrección); registrar el movimiento en la base de datos para auditoría.
- [x] Implementar alerta de stock bajo (mínimo configurable por producto) y mostrarla en el listado de productos. Falta mostrarla en el reporte del día (módulo de reportes).
