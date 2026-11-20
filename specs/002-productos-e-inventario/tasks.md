# Tareas 002 — Productos e inventario

**Alcance:** RF-1–34 y RNF-1–7 de la spec, según `plan.md`.
**Limitación de cobertura:** RF-13 ("retirar de la venta") y RF-27 (vender y ajustar a la vez) solo quedan preparados (consulta de productos vendibles y contrato de bloqueo); se verifican de punta a punta cuando exista la spec de ventas.

Ordenadas por dependencia. Cada tarea se verifica antes de pasar a la siguiente.
Las tareas completadas y subidas quedan marcadas con `[x]`.
Las pruebas de integración y todo lo que toque MySQL requieren una instancia real; este entorno no la tiene. Hasta ejecutarlas, esas verificaciones se informan como **no verificadas**.

- [x] **T1. Escribir las funciones puras de validación de productos y sus pruebas unitarias (≈30 min).** RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-9, RF-12.
  Hecho cuando: `npm test` pasa y cubre unidad válida (`unidad`/`kilo`), nombre vacío o con espacios, precio de venta > 0 y costo ≥ 0 enteros, venta con pérdida (igual no cuenta), código vacío a `null`, cantidades por unidad (enteros o 3 decimales), `0.1 + 0.2` en kilos igual a `0.3`, bloqueo de cambio de unidad con historia y `validarDatosProducto` con un error en español por cada campo inválido.

- [ ] **T2. Escribir las funciones puras de ajuste, estado de stock y orden, con sus pruebas unitarias (≈30 min).** RF-8, RF-17, RF-22, RF-23, RF-24, RF-25, RF-26, RF-31, RF-32, RF-33, RF-34.
  Hecho cuando: `npm test` pasa y cubre merma, reposición y corrección; cantidad 0 o negativa rechazada y corrección a 0 válida; merma mayor al stock rechazada con el stock actual; corrección igual al stock con diferencia 0; `armarMovimiento` con diferencia con signo, stock antes y después y `creadoEn = hoy`; `estadoStock` (agotado con stock 0, bajo solo con mínimo > 0 y stock ≤ mínimo, desactivado sin alerta); `resumirAlertas` solo con activos; activos primero y orden por nombre.

- [ ] **T3. Crear la migración 003 y actualizar `schema.sql` (≈25 min).** RF-7, RF-8, RF-26, RF-29, RNF-1, RNF-7.
  Hecho cuando: ambos archivos definen `stock` y `stock_minimo` como `DECIMAL(10,3)`, `unidad_medida` como `ENUM('unidad','kilo')`, `CHECK (stock >= 0)` y la tabla `movimientos_stock` con su índice; la migración normaliza unidades previas, copia el stock existente como "stock inicial" y avisa antes si hay stock negativo; ambos son coherentes entre sí y con el plan (revisión de diff). *No verificada contra MySQL real.*

- [ ] **T4. Implementar el modelo de movimientos y las consultas de lectura de productos (≈30 min).** RF-16, RF-17, RF-18, RF-19, RF-20, RF-28, RF-29, RF-33, RNF-6.
  Hecho cuando: existen `movimientosStock.model.js` (solo `insertar` y `listarPorProducto`, sin modificar ni borrar) y, en `productos.model.js`, el listado con `buscar` y `categoria` que incluye desactivados, `buscarPorId`, `buscarPorCodigoBarras`, `listarCategorias`, la consulta de vendibles (solo activos) y el costo solo para administrador; los valores `DECIMAL` salen como número; `node --check` y la importación de los módulos no dan errores.

- [ ] **T5. Implementar las escrituras de productos y el ajuste transaccional de stock en el modelo (≈30 min).** RF-1, RF-5, RF-8, RF-9, RF-10, RF-11, RF-12, RF-13, RF-14, RF-15, RF-22, RF-23, RF-25, RF-26, RF-27, RF-30, RNF-1, RNF-2.
  Hecho cuando: `crear` inserta producto y movimiento "stock inicial" en una transacción; `actualizar` usa lista blanca sin `stock` ni `activo`; `cambiarEstado` no toca stock ni historial y no existe borrado; `ajustarStock` bloquea con `SELECT … FOR UPDATE`, actualiza stock e inserta el movimiento en una sola transacción con rollback ante cualquier fallo, y acepta productos desactivados; `tieneVentasOMovimientos` disponible; la revisión de diff confirma que no hay SQL fuera de los modelos.

- [ ] **T6. Implementar el controlador y las rutas de productos (≈30 min).** RF-1–15, RF-17–25, RF-30, RF-32, RF-33, RF-34, RNF-5, RNF-6.
  Hecho cuando: existen las 8 rutas del plan con las fijas (`/categorias`, `/resumen-stock`) antes de `/:id`; las de escritura, ajuste e historial exigen `requiereRol('administrador')`; el controlador valida con las funciones puras, devuelve 409 `VENTA_CON_PERDIDA` salvo `confirmarPerdida`, 409 de código repetido con el nombre del otro producto, avisos de nombre repetido y `estado_stock` calculado en cada lectura; el filtro `estadoStock` y el resumen funcionan; todos los mensajes están en español y la app arranca sin errores de importación.

- [ ] **T7. Actualizar tipos, utilidades de formato y la vista de inventario con filtros y resumen (≈30 min).** RF-17, RF-18, RF-19, RF-20, RF-21, RF-31, RF-33, RF-34, RNF-4, RNF-5.
  Hecho cuando: `types/index.ts` y `utils/formato.ts` (`formatearClp`, `formatearCantidad`, `parsearCantidad`) existen; `InventarioView` tiene búsqueda, filtro de categoría y de estado (leyendo `?estado=` de la dirección), etiquetas Agotado, Stock bajo y No disponible, filas de desactivados atenuadas, columna de acciones solo para administrador y sin costo ni margen para el cajero; `ResumenStock` aparece en `/ventas` con enlaces a los filtros y se oculta sin alertas; `tsc --noEmit` pasa.

- [ ] **T8. Construir el formulario de producto y los modales de ajuste e historial (≈30 min).** RF-1–9, RF-10, RF-12, RF-22, RF-23, RF-24, RF-25, RF-28, RF-29, RF-30.
  Hecho cuando: `FormularioProducto` crea y edita (stock solo de lectura al editar, unidad bloqueada con historia, error de código repetido con nombre, alerta "Venderás con pérdida" con botón "Guardar de todos modos", aviso de nombre repetido); `AjusteStockModal` muestra motivo, cantidad, nota y vista previa "actual → quedará", y deshabilita Confirmar si quedaría negativo; `HistorialStockModal` es de solo lectura; `tsc --noEmit` y `vite build` pasan.

- [ ] **T9. Escribir las pruebas de integración del módulo (≈30 min).** RF-1–34, RNF-1, RNF-2, RNF-5, RNF-6, RNF-7.
  Hecho cuando: `tests/integracion.test.js` contiene los escenarios del plan (altas válidas e inválidas, venta con pérdida, código repetido incluido desactivado, stock inicial, edición sin tocar stock, precio congelado en `detalle_ventas`, cambio de unidad bloqueado, desactivar y reactivar, 403 del cajero en cada ruta de administrador, costo oculto al cajero, filtros, ajustes, **dos mermas simultáneas** con `Promise.all`, `CHECK` contra stock negativo, reversa si falla el movimiento, historial y resumen) y `npm run test:integracion` se ejecuta contra MySQL real. *Sin MySQL en este entorno, la tarea queda con las pruebas escritas pero no ejecutadas, y así se reporta.*

- [ ] **T10. Completar el checklist manual, la verificación de rendimiento y la documentación de cierre (≈25 min).** RF-1–34, RNF-3, RNF-4, RNF-5.
  Hecho cuando: se completa el checklist manual del plan (crear por unidad y kilo con coma, pérdida, código repetido, desactivar y reactivar, ajuste con vista previa, historial, etiquetas, resumen, vista del cajero, montos `$1.490` y `2,5 kg`) y el listado con filtros responde en menos de 2 s con 5.000 productos de prueba, en un entorno con MySQL real; `npm test`, `tsc --noEmit` y `vite build` pasan; `README.md` documenta endpoints y la migración 003 y `MEMORY.md` refleja el estado y los pendientes; se marca la spec como implementada.
