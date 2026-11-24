# Plan 005 - Reportes y cierre de caja

**Estado:** borrador (espera aprobación)

## Estado actual y enfoque

El sistema ya guarda todo lo que los reportes necesitan, salvo una cosa, y no tiene nada que los muestre:

- **Ventas:** `ventas` guarda total, método de pago, estado, cajero y `fecha` (el momento en que la venta se cerró; una anulada conserva el día en que se vendió). `listarHistorial` y `resumenHistorial` ya resumen un período, pero solo cuentan por estado.
- **Abonos:** `fiado_transacciones` guarda cada abono con su método de pago, quién lo registró y, si se anuló, su anulación.
- **Costos:** `productos.precio_costo` existe, pero `detalle_ventas` solo congela el **precio** de venta. Si cambia un costo, cambiaría la ganancia de ventas pasadas. Es la brecha que obliga a tocar la base de datos.
- **Reportes:** `GET /api/reportes/ventas-hoy` responde 501 y no hay ninguna pantalla. Principio 4: no puede quedar un 501 en código nuevo.
- **Turnos y cierres:** no existe nada. No hay forma de saber qué vendió y cobró cada persona entre dos cierres.

Este plan es **incremental** y cubre toda la spec 005 (RF-1 a RF-30, RNF-1 a RNF-8). Respeta la constitución: capas `routes → controllers → models`, español y CLP sin decimales, y **sin librerías nuevas** (los reportes son tablas y cifras grandes, sin gráficos: están fuera de alcance).

### Brechas detectadas

| Brecha | Estado actual | RF |
| --- | --- | --- |
| Costo congelado | `detalle_ventas` no guarda el costo; `bloquearPorIds` no lo lee a propósito, para que no viaje al cajero | RF-1, 2, 3 |
| Ventas por período | Solo hay un resumen por estado; faltan métodos de pago, cajero, día, promedio, fiado y cobrado | RF-4 a 9 |
| Ganancias | No existe | RF-10 a 13 |
| Productos | Existen las alertas de stock, pero no un ranking de ventas ni una lista de "por reponer" | RF-14, 15 |
| Cierre de caja | No existe la tabla ni el cálculo del turno | RF-16 a 24, 30 |
| Cierres para el administrador | No existe la lista, el detalle ni los turnos sin cerrar | RF-25 a 27 |
| Permisos del cajero | El router de reportes es solo del administrador; el cajero necesita una vía propia y acotada | RF-26, 28 |
| Interfaz | No hay pantallas | todos |

### Fuera de alcance de este plan

Lo que dice la spec: exportar o imprimir, gráficos, comparaciones, envíos programados, valorización de inventario, cobranza detallada, gastos e impuestos, retiros de caja, cerrar el turno de otra persona y la pantalla de inicio.

### Interpretaciones que conviene confirmar

- **Qué se descuenta como "efectivo devuelto".** Se descuenta solo cuando la venta o el abono en efectivo que se anula **ya estaba incluido en un cierre cerrado**. Si se anula antes de ese cierre, la venta simplemente no suma ese turno y no hay nada que descontar; así nunca se cuenta dos veces. Es la lectura precisa de RF-19 y RF-23.
- **Cerrar dos veces a la vez.** La pantalla manda el cierre anterior que conocía; si ya no es el último, el servidor responde 409 "este turno ya se cerró". Un cierre inmediatamente posterior y deliberado, sin movimientos, sigue siendo posible (caso límite de la spec).
- **Productos más vendidos:** los 10 primeros por defecto, hasta 50. **Ganancias por producto:** los 100 primeros, de mayor a menor ganancia, con el total de productos vendidos.
- **El Cajero ve sus propios cierres completos** (esperado, contado y diferencia), porque ya cerró: el "conteo a ciegas" solo aplica antes de confirmar.
- **Una sola pantalla de reportes para el administrador, con secciones** (Ventas, Ganancias, Productos y Cierres de caja) y un período compartido (hoy por defecto, con atajos "Ayer", "Esta semana" y "Este mes"). El cajero tiene su propia pantalla "Cerrar turno".
- **Ventas confirmadas en el mismo segundo del cierre** pertenecen a ese cierre. En la práctica no hay choque: cerrar exige no tener una venta en curso.

---

## 1. Archivos que se crean o modifican

### Documentos (primera tarea)

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `specs/005-reportes/` (`spec.md`, `plan.md`, `tasks.md`) | Agregar | Los tres archivos de la spec, en el commit de la primera tarea | — |
| `specs/001-autenticacion-y-roles/spec.md` | Modificar | RF-12 y descripción del Cajero: puede cerrar su turno y ver sus cierres | RF-26, 28 |
| `specs/003-ventas-pos/spec.md` | Modificar | "Fuera de alcance" (cierre de caja y reportes pasan a la spec 005) y el congelado del costo | RF-1 |
| `specs/004-clientes-y-fiado/spec.md` | Modificar | "Fuera de alcance": lo cobrado y el cierre de caja pasan a la spec 005 | RF-7 |
| `docs/CONSTITUTION.md` | Modificar | Principio 5: el **precio y el costo** del detalle de venta quedan congelados | RF-1 |

### Base de datos

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `backend/database/migration_006_spec005.sql` | Crear | Para bases existentes (una sola vez, con respaldo; exige la 005): ver detalle abajo | RF-1, 2, 19, 22, 24 |
| `backend/database/schema.sql` | Modificar | Mismos cambios para bases nuevas (las pruebas cargan este archivo) | idem |

**Cambios de esquema:**

- `detalle_ventas.costo_unitario` `DECIMAL(11,2) NULL`, con `CHECK (costo_unitario >= 0)`. Es el costo del producto al confirmar la venta. **Nulo en las ventas anteriores:** no se inventa un costo (RF-2).
- Tabla nueva `cierres_caja`, de solo inserción:
  - `usuario_id` (FK), `desde` (inicio del turno, nulo si no hubo movimientos), `cerrado_en`.
  - `cierre_anterior_id` (FK a sí misma, nulo en el primer cierre) y una columna generada con su valor (o 0) para el índice **`UNIQUE (usuario_id, ...)`**: un turno se cierra una sola vez aunque lleguen dos solicitudes a la vez (RF-24).
  - `fondo_inicial`, `efectivo_contado`, `efectivo_esperado`, `diferencia`, `efectivo_devuelto`.
  - Lo vendido en el turno por método: `ventas_efectivo`, `ventas_debito`, `ventas_credito`, `ventas_fiado` y `cantidad_ventas`.
  - Lo cobrado por abonos: `abonos_efectivo`, `abonos_debito`, `abonos_credito`, `abonos_transferencia`.
  - `observacion` (255, opcional). Montos con `CHECK >= 0` salvo `diferencia` (puede ser negativa).
- Índices para que los períodos y los turnos respondan rápido con 50.000 ventas: `ventas (usuario_id, fecha)`, `fiado_transacciones (tipo, fecha)` y `fiado_transacciones (usuario_id, fecha)`.

### Backend

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `backend/src/utils/reportes.js` + `reportes.test.js` | Crear | Funciones puras de reportes (sección 2) | RF-4 a 15 |
| `backend/src/utils/cierres.js` + `cierres.test.js` | Crear | Funciones puras del cierre (sección 2) | RF-16 a 24 |
| `backend/src/utils/ventas.js` | Modificar | Se reutiliza `rangoDeFechas`; se agrega `calcularCostoLinea` junto a `calcularSubtotal` | RF-1, 10 |
| `backend/src/models/productos.model.js` | Modificar | `leerCostosPorIds(conexion, ids)`: lee el costo dentro de la transacción de la venta (`bloquearPorIds` sigue sin leerlo) | RF-1, 3 |
| `backend/src/models/ventas.model.js` | Modificar | `confirmar` guarda `costo_unitario` en cada línea, dentro de la misma transacción | RF-1 |
| `backend/src/models/reportes.model.js` | Crear | Consultas de ventas por período, ganancias, más vendidos y por reponer | RF-4 a 15 |
| `backend/src/models/cierresCaja.model.js` | Crear | Turno actual, efectivo del turno, cierre (transacción), listado, detalle y turnos sin cerrar | RF-16 a 27, 30 |
| `backend/src/controllers/reportes.controller.js` | Reescribir | Controladores de los cuatro reportes; se elimina el 501 `ventasDelDia` | RF-4 a 15 |
| `backend/src/controllers/cierresCaja.controller.js` | Crear | Turno, cierre, listado, detalle y turnos sin cerrar con sus permisos | RF-16 a 28 |
| `backend/src/routes/reportes.routes.js` | Modificar | Rutas nuevas del administrador; se retira `/ventas-hoy` | RF-4 a 15, 28 |
| `backend/src/routes/cierresCaja.routes.js` | Crear | Rutas de cierres (tabla abajo) | RF-16 a 28 |
| `backend/src/app.js` | Modificar | Monta `/api/cierres-caja` | — |
| `backend/src/tests/reportes.test.js` | Crear | Integración con archivo y base propios (`almacenpro_test_reportes`) | RF-1 a 30 |
| `backend/src/utils/validaciones.test.js` | Modificar | La lista blanca de una cuenta desactivada **no** incluye las rutas nuevas | caso límite |
| `README.md`, `MEMORY.md`, `AGENTS.md` | Modificar (al cierre) | Endpoints, migración 006, estado y pendientes | — |

Sin cambios: `middlewares/*` (la lista blanca de cuentas desactivadas no crece), `services/*` y `utils/rut.js`.

**Rutas (todas exigen sesión):**

| Método y ruta | Acceso | Qué hace | RF |
| --- | --- | --- | --- |
| `GET /api/reportes/ventas?desde=&hasta=` | administrador | Vendido, cantidad, promedio, por método, por cajero, por día, anuladas, canceladas, fiado y cobrado | RF-4 a 9 |
| `GET /api/reportes/ganancias?desde=&hasta=` | administrador | Ventas, costo, ganancia y margen; por producto; ventas sin costo aparte | RF-10 a 13 |
| `GET /api/reportes/mas-vendidos?desde=&hasta=&limite=` | administrador | Ranking por monto vendido | RF-14 |
| `GET /api/reportes/por-reponer` | administrador | Agotados y de stock bajo | RF-15 |
| `GET /api/cierres-caja/turno` | sesión | Datos para cerrar: desde cuándo, cierre anterior, fondo sugerido y si hay una venta en curso. **Sin el efectivo esperado** | RF-16, 17, 18, 21 |
| `POST /api/cierres-caja` | sesión | Cierra el turno `{ cierre_anterior_id, fondo_inicial, efectivo_contado, observacion? }` y devuelve el resultado completo | RF-16 a 24 |
| `GET /api/cierres-caja?desde=&hasta=&usuario_id=` | sesión | Administrador: todos los cierres, filtrables por persona. Cajero: solo los suyos | RF-25, 26 |
| `GET /api/cierres-caja/sin-cerrar` | administrador | Turnos sin cerrar | RF-27 |
| `GET /api/cierres-caja/:id` | sesión | Detalle de un cierre; el cajero solo ve los suyos (404 para los demás) | RF-25, 26 |

El administrador es el único que llama a `/reportes/*` y a `sin-cerrar` (403 para el cajero, también por acceso directo). No existen rutas para editar ni borrar un cierre (RF-22). Se eliminan `GET /api/reportes/ventas-hoy` (501) y su controlador.

### Frontend

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `frontend/src/types/index.ts` | Modificar | Tipos de los reportes, del turno y de los cierres | todos |
| `frontend/src/utils/formato.ts` | Modificar | Porcentaje entero y descripción de la diferencia ("Sobran $X") | RNF-5 |
| `frontend/src/views/ReportesView.tsx` | Crear | Pantalla del administrador con secciones y período compartido | RF-4 a 15, 25, 27 |
| `frontend/src/components/SelectorPeriodo.tsx` | Crear | Desde, hasta y atajos; valida el período antes de consultar | RF-8 |
| `frontend/src/components/ReporteVentas.tsx` | Crear | Vendido, método, cajero, día, anuladas, fiado y cobrado | RF-4 a 7, 9 |
| `frontend/src/components/ReporteGanancias.tsx` | Crear | Ganancia, margen, por producto, ventas sin costo y aviso de costo $0 | RF-10 a 13 |
| `frontend/src/components/ReporteProductos.tsx` | Crear | Más vendidos y por reponer | RF-14, 15 |
| `frontend/src/components/ListaCierres.tsx` | Crear | Cierres con faltantes y sobrantes destacados, turnos sin cerrar y detalle | RF-25, 27 |
| `frontend/src/components/DetalleCierreModal.tsx` | Crear | Todas las cifras de un cierre | RF-25, 26 |
| `frontend/src/views/CierreCajaView.tsx` | Crear | Cerrar turno (conteo a ciegas), resultado y "Mis cierres" | RF-16 a 22, 26 |
| `frontend/src/App.tsx` | Modificar | `/reportes` (administrador), `/cierre-caja` (ambos roles) y enlaces del menú | RF-26, 28 |
| `frontend/src/styles/reportes.css` | Crear | Estilos (reutiliza `Modal`, `segmento`, `tabla`, `chip`, `boton`, `caja-periodo`) | RNF-5, 7 |

Para la interfaz se usa la skill `frontend-design`, con la línea visual de inventario, ventas y clientes. `package.json` no cambia.

---

## 2. Funciones puras de lógica

Ninguna lee reloj, base de datos ni red.

| Función | Qué decide | RF |
| --- | --- | --- |
| `calcularCostoLinea(costo, cantidad)` | Costo de una línea: costo por cantidad, redondeado al peso (medio peso hacia arriba), con enteros y `BigInt` como `calcularSubtotal`. Es la misma regla que el `ROUND` del reporte | RF-1, 10 |
| `rangoDeReporte({ desde, hasta }, hoy)` | Reutiliza `rangoDeFechas` y exige hasta 366 días; devuelve el mensaje que dice qué corregir | RF-8 |
| `armarResumenVentas(filas)` | Vendido, cantidad, venta promedio (entera), desglose por método, anuladas (cantidad y monto) y canceladas; **solo las completadas suman** | RF-4, 6 |
| `armarCobrado({ ventasPorMetodo, abonosPorMetodo })` | Lo cobrado: ventas en efectivo, débito y crédito más abonos; el fiado no es cobrado | RF-7 |
| `calcularMargen(vendido, costo)` | Ganancia y margen en porcentaje entero; sin ventas, margen 0 | RF-10 |
| `armarGananciasPorProducto(filas)` | Ordena de mayor a menor ganancia, calcula el margen de cada producto y marca `costo_cero` | RF-11, 13 |
| `ordenarPorReponer(productos)` | Agotados primero, luego stock bajo, ambos por stock ascendente; usa `estadoStock` | RF-15 |
| `validarEfectivo(valor, nombre)` | Entero en pesos de 0 o más (tope $99.999.999); rechaza decimales, negativos y texto con un mensaje que dice qué corregir | RF-17 |
| `calcularCierre({ fondoInicial, efectivoVentas, efectivoAbonos, efectivoDevuelto, efectivoContado })` | Efectivo esperado (fondo + ventas en efectivo + abonos en efectivo − devuelto), diferencia (contado − esperado) y estado `cuadra`, `sobra` o `falta` | RF-19, 20 |
| `describirDiferencia(diferencia)` | "La caja cuadra", "Sobran $X" o "Faltan $X" | RF-20 |
| `normalizarObservacion(texto)` | Ya existe en `utils/clientes.js`; se reutiliza (255, opcional) | RF-17 |

---

## 3. Algoritmos en pseudocódigo

### A. Congelar el costo al confirmar la venta (RF-1, RF-2)

```text
EN confirmar(...) DESPUÉS de bloquearPorIds y verificar el carrito, DENTRO de la misma transacción:
  costos = productos.leerCostosPorIds(conexion, ids)         // ya están bloqueados: leen el mismo valor
  PARA CADA línea:
    UPDATE detalle_ventas SET costo_unitario = costos[línea.producto_id]
     WHERE venta_id = ventaId AND producto_id = línea.producto_id
  ... (descuento de stock, movimiento, cobro y fiado como hoy)
```

El costo se lee y guarda en la transacción que confirma la venta: si falla algo, no queda ninguno. Antes de confirmar, las líneas no tienen costo (el carrito no lo necesita ni lo expone). Las ventas anteriores quedan con `costo_unitario` nulo (RF-2).

### B. Efectivo del turno de una persona (RF-16 a 19, 23)

```text
FUNCIÓN calcularTurno(conexion, usuarioId, hasta):
  anterior = último cierre de usuarioId (id y cerrado_en) o ninguno
  // El turno es (cierre anterior, ahora]; "desde" es solo la primera venta o abono de ese tiempo (nulo si no hubo)
  desde = primera venta o abono de la persona después de su cierre anterior (o desde siempre si nunca cerró)

  // Ventas confirmadas por la persona en (desde, hasta], por método
  ventas = SELECT metodo_pago, COUNT(*), SUM(total) FROM ventas
            WHERE usuario_id = u AND estado = 'completada' AND fecha > desde AND fecha <= hasta GROUP BY metodo_pago
  // Abonos registrados por la persona en el turno y no anulados, por método
  abonos = SELECT metodo_pago, SUM(monto) FROM fiado_transacciones t
            WHERE tipo = 'abono' AND usuario_id = u AND fecha > desde AND fecha <= hasta
              AND NOT EXISTS (anulación de ese abono) GROUP BY metodo_pago
  // Efectivo devuelto: anulaciones hechas por la persona en el turno de algo que YA estaba en un cierre
  devueltoVentas  = SUM(total) de ventas 'anulada' en efectivo con anulada_por = u y anulada_en en (desde, hasta]
                    Y existe un cierre de la autora de la venta con cerrado_en entre venta.fecha y anulada_en
  devueltoAbonos  = SUM(monto) de abonos en efectivo anulados por u en (desde, hasta]
                    Y existe un cierre de la autora del abono con cerrado_en entre abono.fecha y la anulación
  DEVOLVER { desde, anterior, ventas, abonos, efectivoDevuelto = devueltoVentas + devueltoAbonos }
```

Las ventas anuladas **antes** del cierre de su turno ya no suman (su estado no es `completada`) y no se descuentan: así no hay doble conteo. Las anuladas **después** del cierre no cambian ese cierre (es una copia de lo que se contó) y se descuentan en el turno de quien anula.

### C. Cerrar el turno (RF-16 a 24)

```text
FUNCIÓN cerrarTurno(usuario, { cierreAnteriorId, fondoInicial, efectivoContado, observacion }, hoy):
  validar fondoInicial y efectivoContado con validarEfectivo; normalizar observación           // 400
  TRANSACCIÓN:
    SELECT usuario FOR UPDATE                                    // serializa los cierres de la misma persona
    ultimo = último cierre de la persona
    SI (ultimo?.id ?? null) <> cierreAnteriorId: ROLLBACK; 409 'TURNO_YA_CERRADO'         // RF-24
    SI existe venta en curso de la persona: ROLLBACK; 409 'VENTA_EN_CURSO'                // RF-21
    turno = calcularTurno(conexion, usuario.id, hoy)
    resultado = calcularCierre({ fondoInicial, efectivoVentas: turno.ventas.efectivo,
                  efectivoAbonos: turno.abonos.efectivo, efectivoDevuelto: turno.efectivoDevuelto, efectivoContado })
    INSERT cierres_caja (… todas las cifras, desde, cerrado_en = hoy, cierre_anterior_id = ultimo?.id)
  COMMIT                                                          // todo o nada (RNF-4)
  RESPONDER 201 { cierre completo, estado: cuadra | sobra | falta }
```

Si dos solicitudes llegan a la vez, el bloqueo de la fila de la persona las ejecuta una tras otra y la segunda ve otro cierre anterior (409). El índice único de `cierres_caja` es la segunda defensa. Un cierre nuevo y deliberado sin movimientos sí se permite: manda `cierre_anterior_id` = el último.

### D. Datos para cerrar sin revelar lo esperado (RF-18)

```text
FUNCIÓN turnoActual(usuario):
  ultimo = último cierre de la persona
  RESPONDER { desde: primera venta o abono después de su último cierre (nulo si no hay), cierre_anterior_id: ultimo?.id ?? null,
              fondo_sugerido: ultimo?.efectivo_contado ?? null, venta_en_curso: existe venta en curso }
  // nunca se entregan ventas, abonos ni esperado: el conteo es a ciegas hasta confirmar
```

### E. Reporte de ventas por período (RF-4 a 9)

```text
FUNCIÓN reporteVentas({ desde, hasta }, hoy):
  rango = rangoDeReporte(...)                                     // 400 con mensaje si es inválido
  grupos   = SELECT estado, metodo_pago, COUNT(*), SUM(total) FROM ventas
              WHERE estado <> 'en_curso' AND fecha >= inicio AND fecha < fin GROUP BY estado, metodo_pago
  porCajero = SELECT usuario, COUNT(*), SUM(total) de las completadas GROUP BY usuario
  porDia    = SELECT DATE(fecha), COUNT(*), SUM(total) de las completadas GROUP BY DATE(fecha)
  abonos    = abonos del período no anulados, por método
  DEVOLVER armarResumenVentas(grupos) + porCajero + porDia + armarCobrado(...)
```

Cada venta cuenta en el día de su `fecha`: una anulada sigue en el día en que se vendió (RF-9). El desglose por método, por cajero y por día suma siempre el mismo total (RNF-3).

### F. Ganancias y rankings (RF-10 a 15)

```text
FUNCIÓN reporteGanancias(rango):
  conCosto = líneas de ventas completadas del período con costo_unitario NO nulo
             vendido = SUM(subtotal);  costo = SUM(ROUND(costo_unitario * cantidad))
  porProducto = lo mismo agrupado por producto, con costo_cero = (alguna línea con costo_unitario = 0)
  sinCosto = ventas completadas del período con alguna línea sin costo: cantidad y total
  DEVOLVER calcularMargen(vendido, costo) + armarGananciasPorProducto(porProducto) + sinCosto

FUNCIÓN masVendidos(rango, limite):
  SELECT producto, SUM(cantidad), SUM(subtotal) de las completadas del período GROUP BY producto ORDER BY monto DESC LIMIT n
  // incluye productos desactivados

FUNCIÓN porReponer():
  productos activos con stock = 0 o (stock_minimo > 0 y stock <= stock_minimo) → ordenarPorReponer
```

Una venta tiene costo en todas sus líneas o en ninguna (se guarda al confirmar), así que "sin costo registrado" se decide por venta.

### G. Cierres y turnos sin cerrar (RF-25 a 27)

```text
FUNCIÓN listarCierres(usuario, { desde, hasta, usuarioId }):
  SI usuario es cajero: filtrar siempre por su propio id (ignora usuarioId)
  SELECT cierres con el nombre de quien cerró, por cerrado_en en el rango, del más reciente al más antiguo

FUNCIÓN turnosSinCerrar():
  PARA CADA persona con alguna venta completada o abono suyo posterior a su último cierre (activa o no):
    { persona, desde = primera actividad desde su último cierre, efectivo_cobrado = ventas en efectivo + abonos en efectivo desde entonces }
```

---

## 4. Cómo se pinta en la interfaz

### `/reportes` (solo administrador) (RF-4 a 15, 25, 27)

- Cabecera con el **período** (Desde / Hasta, hoy por defecto) y atajos **Hoy · Ayer · Esta semana · Este mes**. Un período inválido muestra el mensaje y no consulta. Secciones como fichas: **Ventas · Ganancias · Productos · Cierres de caja**.
- **Ventas:** banda verde botella como la del historial, con **Vendido** en grande, cantidad de ventas y venta promedio. Debajo, en tablas: por método de pago, por cajero y por día. Un bloque aparte muestra **Vendido al fiado** y **Cobrado por abonos**, con una nota que explica la diferencia, y una línea "N anuladas ($X) y M canceladas no se suman".
- **Ganancias:** ganancia y margen del período en la banda, tabla por producto de mayor a menor ganancia, con una marca "costo $0: ganancia posiblemente mayor a la real" y un aviso ámbar "N ventas anteriores no tienen costo registrado ($X): no entran al cálculo".
- **Productos:** "Más vendidos" (cantidad en su unidad y monto) y "Por reponer" (agotados primero, con stock y mínimo), con enlace al inventario.
- **Cierres de caja:** arriba, **Turnos sin cerrar** (persona, desde cuándo, efectivo cobrado); luego la lista de cierres (fecha, persona, esperado, contado y **diferencia** con color: faltantes en rojo sello, sobrantes en ámbar, cuadra en verde). Un clic abre el detalle. Se puede filtrar por persona.

### `/cierre-caja` (cajero y administrador) (RF-16 a 22, 26, RNF-1, 7)

- Título "Cerrar mi turno" con "Tu turno empezó el …". Si hay una venta en curso, un aviso pide terminarla o cancelarla y el botón queda deshabilitado.
- Formulario: **Fondo inicial** (sugerido con el efectivo contado de su cierre anterior), **Efectivo contado** (campo grande, con teclado numérico) y observación opcional. No muestra ventas, abonos ni lo esperado.
- Al confirmar se pide una última confirmación ("Un cierre no se puede deshacer") y se muestra el **resultado**: "La caja cuadra", "Sobran $X" o "Faltan $X" en letra grande, con el resumen del turno (ventas y abonos por método, efectivo devuelto, esperado y contado). El botón se deshabilita mientras se envía.
- Abajo, **Mis cierres**: lista de los suyos con su diferencia y detalle.

### Menú

- Administrador: se agrega **Reportes** (el cierre de su propio turno está dentro de Reportes → Cierres de caja, con un botón "Cerrar mi turno").
- Cajero: se agrega **Cerrar turno**. Nunca ve Reportes ni costos, ni por pantalla ni por URL directa (`SinPermisos`).

---

## 5. Decisiones técnicas justificadas

| Decisión | Por qué | Alternativa descartada | RF |
| --- | --- | --- | --- |
| `detalle_ventas.costo_unitario` nulo en lo anterior | La ganancia pasada no cambia aunque cambie un costo, y no se inventan costos para ventas antiguas | Usar el costo actual: ganancias falsas con el tiempo | RF-1, 2, 12 |
| El costo se lee en la transacción de la venta con una función propia | `bloquearPorIds` no lee costos a propósito, para que no lleguen al cajero; así la lectura queda dentro de la misma transacción sin ampliar esa función | Agregar `precio_costo` a `bloquearPorIds`: acerca el costo a respuestas del cajero | RF-1, 3 |
| El costo se congela al **confirmar**, no al agregar al carrito | La spec dice "al confirmarse" y es el momento del cobro; el carrito puede durar minutos | Congelarlo al agregar: ventas con costos de hace 15 minutos | RF-1 |
| Cierre como copia (`cierres_caja`) y no cálculo en vivo | Es la constancia de lo contado ese día; una anulación posterior no debe reescribir un cierre | Recalcular cada cierre con los datos de hoy | RF-22, 23, 29 |
| El esperado descuenta devoluciones solo si el origen ya estaba cerrado | Evita contar dos veces lo anulado antes del cierre, y mantiene el efectivo coherente | Descontar toda anulación en efectivo: doble descuento | RF-19, 23 |
| `cierre_anterior_id` en la petición y `UNIQUE` con columna generada | Cierra el doble clic a nivel de base de datos, incluso para el primer cierre (donde el valor es nulo) | Solo el bloqueo de la fila: no distingue un doble clic de un cierre posterior deliberado | RF-24; RNF-4 |
| `SELECT ... FOR UPDATE` de la fila de la persona al cerrar | Serializa los cierres simultáneos de la misma cuenta | Sin bloqueo: dos cierres leerían el mismo turno | RF-24 |
| El turno no devuelve el esperado hasta cerrar | Conteo a ciegas: la persona declara lo que contó, no lo que debería haber | Mostrar el esperado antes: permite escribir lo que "debería" haber | RF-18 |
| Rutas de cierres en un router propio, abierto a la sesión | El cajero necesita cerrar su turno sin abrir el router de reportes, que es del administrador | Mezclarlas en `/reportes`: obligaría a excepciones de rol dentro de un router de administrador | RF-16, 28 |
| El cajero no entra a la lista blanca de una cuenta desactivada con venta en curso | La spec dice que esa cuenta solo termina o cancela su venta; sus movimientos se ven como turno sin cerrar | Ampliar la lista blanca | RF-27 |
| Agregaciones en SQL con `GROUP BY` y funciones puras para armar el resumen | 50.000 ventas sin traerlas al servidor; una sola regla ("solo suman las completadas") | Sumar en el controlador o en React | RNF-2, 3 |
| `ROUND(costo_unitario * cantidad)` en SQL y `calcularCostoLinea` en la prueba | La misma regla de redondeo en los dos lados; una prueba verifica que coinciden | Calcular en coma flotante | RF-10 |
| Índices `(usuario_id, fecha)` y `(tipo, fecha)` | Los turnos y los abonos por período filtran por persona y fecha | Sin índices: lento con 50.000 ventas y 20.000 movimientos | RNF-2 |
| Ranking por monto vendido, no por cantidad | Hay productos por unidad y por kilo; ordenar por cantidad mezclaría unidades | Ordenar por cantidad | RF-14 |
| Sin librerías de gráficos | Principio 1 y la spec deja los gráficos fuera | Agregar una librería de gráficos | — |
| Se elimina el 501 de `ventas-hoy` | Principio 4: no quedan endpoints sin implementar | Dejarlo | — |

---

## 6. Estrategia de pruebas

### 6.1 Pruebas unitarias (`npm test`)

| Prueba | Función | RF |
| --- | --- | --- |
| Costo por cantidad, medio peso hacia arriba, kilos con 3 decimales, sin desborde | `calcularCostoLinea` | RF-1, 10 |
| Período válido, fechas inválidas, "desde" posterior, más de 366 días, hoy por defecto | `rangoDeReporte` | RF-8 |
| Solo suman las completadas; anuladas (cantidad y monto) y canceladas aparte; promedio entero; período vacío en cero | `armarResumenVentas` | RF-4, 6 |
| El fiado no es cobrado; abonos suman; el desglose cuadra con el total | `armarCobrado` | RF-7 |
| Margen entero, sin ventas, costo mayor que la venta (margen negativo) | `calcularMargen` | RF-10 |
| Orden por ganancia, margen por producto, marca de costo $0 | `armarGananciasPorProducto` | RF-11, 13 |
| Agotados primero y luego bajo, por stock ascendente; los desactivados no aparecen | `ordenarPorReponer` | RF-15 |
| Enteros de 0 o más; rechaza decimales, negativos, texto y el tope | `validarEfectivo` | RF-17 |
| Esperado con fondo, ventas, abonos y devoluciones; cuadra, sobra y falta | `calcularCierre` | RF-19, 20 |
| Los tres textos de la diferencia | `describirDiferencia` | RF-20 |
| La lista blanca de una cuenta desactivada no incluye reportes ni cierres | `esRutaDeVentaEnCurso` | caso límite |

### 6.2 Pruebas de integración (`npm run test:integracion`, MySQL real, base `almacenpro_test_reportes`)

| Escenario | RF |
| --- | --- |
| Confirmar una venta guarda el costo de cada línea; cambiar el costo del producto después no cambia el de la venta; una venta anterior (sin costo) queda nula | RF-1, 2 |
| Si falla la confirmación, no queda costo ni venta (reversa total) | RF-1; RNF-4 |
| El costo no viaja en ninguna respuesta del cajero (carrito, confirmación, cierre, cierres, turno) | RF-3; RNF-8 |
| Ventas por período: total, cantidad, promedio y desglose por método; por cajero y por día suman el total | RF-4, 5; RNF-3 |
| Anuladas y canceladas no suman y se informan aparte; una anulada sigue en el día en que se vendió | RF-6, 9 |
| Fiado y cobrado: lo vendido al fiado no es cobrado; los abonos suman por método; un abono anulado no cuenta | RF-7 |
| Período inválido (formato, invertido, más de un año) responde 400 con mensaje | RF-8 |
| Ganancias: ventas, costo, ganancia y margen; por producto de mayor a menor; ventas sin costo aparte; aviso de costo $0 | RF-10 a 13 |
| Más vendidos por monto, con unidad, incluidos los desactivados; por reponer con agotados primero | RF-14, 15 |
| El cajero recibe 403 en ventas, ganancias, más vendidos, por reponer y turnos sin cerrar | RF-28 |
| Turno: el cajero recibe desde cuándo, el cierre anterior y el fondo sugerido, sin el esperado | RF-17, 18 |
| Cierre: guarda todas las cifras; el esperado = fondo + efectivo + abonos en efectivo − devuelto; cuadra, sobra y falta | RF-19, 20 |
| Montos inválidos (decimales, negativos, texto) y observación larga se rechazan; con venta en curso no se puede cerrar | RF-17, 21 |
| Un cierre no se edita ni se borra (no hay rutas); lo vendido después va al turno siguiente | RF-22 |
| Anular una venta o un abono en efectivo **después** del cierre no cambia ese cierre y se descuenta en el turno de quien anula; anularla **antes** no se descuenta dos veces | RF-23 |
| **Dos cierres simultáneos** de la misma persona: uno se registra y el otro recibe 409; el primer cierre también | RF-24; RNF-4 |
| Cierre sin movimientos, y el primero de una persona sin sugerencia de fondo | casos límite |
| El administrador ve todos los cierres filtrados por persona y fecha, y los turnos sin cerrar (incluida una cuenta desactivada); el cajero solo los suyos y 404 en los ajenos | RF-25 a 27 |
| Una cuenta desactivada con venta en curso no puede cerrar su turno | casos límite |
| El cierre sigue asociado a su cuenta aunque se desactive | RF-30 |
| Conciliación: tras una mezcla de ventas, abonos y anulaciones, los totales del reporte, los cierres y las cuentas de los clientes cuadran | RNF-3 |
| Mensajes en español y montos sin decimales | RNF-5, 6 |
| Migración: una base con datos de la spec 004 conserva todo y las ventas anteriores quedan con costo nulo (verificada a mano en la tarea de la migración) | migración |

### 6.3 Verificación manual y de rendimiento (entorno de prueba aparte)

| Verificación | RF |
| --- | --- |
| Cerrar un turno completo en menos de 2 minutos, con teclado y con pantalla táctil | RNF-1, 7 |
| Cajero: ve "Cerrar turno" y su resultado, no ve Reportes ni costos ni por URL directa | RF-26, 28 |
| Administrador: recorre las cuatro secciones con distintos períodos y atajos; ve faltantes, sobrantes y turnos sin cerrar | RF-4 a 15, 25, 27 |
| Una caja que no cuadra: el cierre se guarda y la diferencia se ve de lejos | RF-20 |
| Con una venta en curso, el cierre se bloquea con un mensaje claro | RF-21 |
| Doble clic en "Confirmar cierre": un solo cierre | RF-24 |
| Anular una venta en efectivo después de un cierre y ver el efecto en el turno de quien anula | RF-23 |
| `tsc --noEmit` y `vite build` sin errores | RNF-5 |
| Con 50.000 ventas, 5.000 productos y 20.000 movimientos: cada reporte, la lista de cierres y los turnos sin cerrar responden en menos de 2 s | RNF-2 |

---

## Secuencia de implementación

1. Documentos: specs 001, 003 y 004 y principio 5 de la constitución; se agregan los tres archivos de la spec 005.
2. Funciones puras de reportes y de cierres, con sus pruebas unitarias.
3. Migración 006 y `schema.sql`.
4. Costo congelado al confirmar (modelo de productos y de ventas) y sus pruebas.
5. Modelo y rutas de los reportes (ventas, ganancias, productos); se retira el 501.
6. Modelo y rutas del cierre de caja (turno, cierre, listado, detalle y turnos sin cerrar).
7. Tipos, menú, selector de período y reportes de ventas y ganancias en la interfaz.
8. Reporte de productos y pantalla de cierres del administrador.
9. Pantalla de cierre de caja (cajero y administrador).
10. Pruebas de integración de la spec 005.
11. Checklist manual, rendimiento, `README.md`, `MEMORY.md` y `AGENTS.md`; marcar la spec como implementada.

(El detalle por tarea, con su "hecho cuando", va en `tasks.md`.)

## Riesgos y cuidados

- **Migración sobre datos reales:** agrega una columna, una tabla y tres índices, sin tocar ningún dato. Exige respaldo y la migración 005 aplicada antes; no se aplica en `almacenpro` sin tu visto bueno. Las pruebas usan su propia base.
- **Ventas de prueba sin costo:** las 10 ventas de prueba que ya están en `almacenpro` no tienen costo, así que en Ganancias aparecerán "sin costo registrado" hasta que se hagan ventas nuevas. No se les inventa un costo.
- **El efectivo de un turno depende de la hora:** todo se compara con la hora del servidor, como el resto del proyecto. Una prueba cubre el borde (movimiento en el mismo segundo del cierre).
- **Costos y el cajero:** el riesgo es que un costo llegue a una respuesta del cajero. Las pruebas recorren las respuestas del cajero buscando costos, y `bloquearPorIds` sigue sin leerlos.
- **Dos cierres a la vez:** se cubren con el bloqueo de la fila, el cierre anterior en la petición y el índice único; se prueba con `Promise.all`.
- **Cambio de comportamiento de `confirmar`:** ahora actualiza el detalle dentro de la transacción. Las 93 pruebas de integración actuales deben seguir en verde.
- **Rendimiento:** las consultas agrupan en SQL y los índices nuevos cubren los filtros por persona y fecha; se mide con 50.000 ventas y 20.000 movimientos.
- **No tocar lo del usuario:** las pruebas manuales usan puertos y bases propios; el servidor del usuario (4000 y 5173) y `almacenpro` no se usan sin tu visto bueno.
