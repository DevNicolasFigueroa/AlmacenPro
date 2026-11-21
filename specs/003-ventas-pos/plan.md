# Plan 003 - Ventas (punto de venta simple)

## Estado actual y enfoque

El ciclo de la venta ya existe (spec 001): iniciar, registrar actividad, finalizar, cancelar y cancelación a los 15 min. Pero la venta **no tiene productos**: `finalizar` solo cambia el estado a `completada`, `crear` responde 501, no hay clientes, ni fiado, ni anulación, y el historial solo lista canceladas automáticas. La spec 002 dejó listo `listarVendibles`, `movimientosStock.insertar` (tipos `venta` y `anulacion_venta`) y el contrato de bloqueo `FOR UPDATE`.

Este plan es **incremental**, cubre **toda la spec 003** (RF-1–49, RNF-1–10) y respeta la constitución: capas `routes → controllers → models`, ventas + stock + fiado en UNA transacción, 100% en español, CLP sin decimales y **sin librerías nuevas**.

### Brechas detectadas

| Brecha | Estado actual | RF |
| --- | --- | --- |
| Carrito | No existe: la venta en curso no guarda productos | RF-1–10 |
| Cantidades en kilos | `detalle_ventas.cantidad` es `INT`; un producto puede repetirse en la misma venta | RF-4, 5 |
| Estados de cierre | La cancelación manual guarda `anulada` (spec 001); la spec distingue *cancelada* (no se concretó) de *anulada* (corrección del administrador) | RF-10, 35, 42–48 |
| Confirmar | `finalizar` no toca stock; `POST /ventas` devuelve 501 | RF-25–34 |
| Clientes | `nombre` es obligatorio y `rut` opcional; sin modelo; controlador 501 | RF-20–24 |
| Fiado | Nadie escribe cargos; el tipo no contempla anulaciones; la vista no trae el RUT | RF-17, 18, 43, 44 |
| Historial | Solo canceladas automáticas, sin filtro por fecha ni resumen ni detalle | RF-35–41 |
| Anulación | No existe | RF-42–48 |
| Sesión con venta en curso | La lista blanca de rutas solo permite `finalizar` y `cancelar` | spec 001 + RF-1 |
| Interfaz | `PuntoVentaView` tiene botones de prueba; `ClientesView` y el historial son provisorios | todos |

### Fuera de alcance de este plan

Lo que dice la spec: abonos, editar o desactivar clientes, corregir un RUT, listado de deudores, límite de crédito, reportes y cierre de caja. La columna `limite_fiado` **no se borra** (no es destructivo dejarla; la spec de clientes y fiado decide).

### Interpretaciones que conviene confirmar

- **Nombre opcional:** al registrar un cliente nuevo aparece un campo "Nombre (opcional)"; si se deja vacío, el cliente existe solo con su RUT. (Ya reflejado en RF-20 de la spec.)
- **Anulación del fiado:** nuevo tipo `anulacion` en `fiado_transacciones` (decidido contigo). Obliga a actualizar el principio 5 de la constitución: *cargos − abonos − anulaciones = saldo*. Se hace junto con la migración.
- **Cajero desactivado con venta en curso:** "terminarla" exige poder ver el carrito, buscar productos, identificar al cliente y confirmar. Se amplía la lista blanca a esas rutas (no a `iniciar`).
- **Fecha del historial:** una venta cuenta en el día en que se **confirmó o canceló**; una anulada sigue contando en el día en que se vendió (para que los totales de ese día no cambien de forma silenciosa).

---

## 1. Archivos que se crean o modifican

### Base de datos

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `backend/database/migration_004_spec003.sql` | Crear | Para bases existentes (una sola vez, con respaldo): ver detalle abajo. Se detiene si hay clientes sin RUT. | RF-4, 5, 10, 20, 43, 44 |
| `backend/database/schema.sql` | Modificar | Mismos cambios para bases nuevas (las pruebas cargan este archivo). | idem |
| `docs/constitution.md` | Modificar | Principio 5: cargo, abono o anulación; conciliación con anulaciones. | RF-43 |

**Cambios de esquema:**

- `ventas.estado`: agregar `cancelada` (manual). La migración convierte las `anulada` existentes en `cancelada` (hasta hoy todas vinieron de cancelar a mano; el administrador nunca pudo anular).
- `ventas`: agregar `anulada_por` (FK a `usuarios`), `anulada_en`, `motivo_anulacion` (255). `fecha` pasa a significar "momento en que se cerró": al confirmar o cancelar se actualiza (índice `idx_ventas_fecha` ya existe). La migración copia `cancelada_en` a `fecha` en las canceladas. Nuevo índice `(estado, fecha)`.
- `detalle_ventas.cantidad`: `INT` → `DECIMAL(10,3)`; `UNIQUE (venta_id, producto_id)` (una línea por producto).
- `clientes`: `nombre` pasa a `NULL`; `rut` pasa a `NOT NULL UNIQUE`, **guardado sin puntos** (`12345678-5`, `K` mayúscula) para que la unicidad no dependa de cómo se escribió; se muestra con el formato `12.345.678-5`.
- `fiado_transacciones.tipo`: agregar `anulacion`; `UNIQUE (venta_id, tipo)` (un cargo y una anulación por venta como máximo; los abonos tienen `venta_id` nulo y no chocan).
- `v_saldo_fiado`: se recrea con `rut` y la suma explícita (cargo suma; abono y anulación restan).

### Backend

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `backend/src/utils/ventas.js` | Crear | Funciones puras de la venta (sección 2). | RF-4, 7, 11, 13, 15, 17, 26, 27, 30, 36, 37, 42, 45 |
| `backend/src/utils/ventas.test.js` | Crear | Pruebas unitarias (`npm test` recoge `src/utils/*.test.js`). | idem |
| `backend/src/utils/rut.js` + `rut.test.js` | Crear | `normalizarRut`, `esRutValido`, `formatearRut` (módulo 11). | RF-20, RNF-10 |
| `backend/src/utils/validaciones.js` | Modificar | `esRutaDeCierreDeVenta` → `esRutaDeVentaEnCurso` con la lista ampliada; actualizar su prueba. | spec 001 RF-15, RF-1 |
| `backend/src/models/ventas.model.js` | Modificar | Carrito (leer, agregar, cambiar, quitar, vaciar), `confirmar`, `anular`, historial, resumen y detalle. `cancelar` y `cancelarAutomaticamente` guardan el nuevo estado y `fecha`. **Se elimina `finalizar`.** | RF-1–10, 25–48 |
| `backend/src/models/clientes.model.js` | Crear | `buscarPorRut`, `buscarPorId`, `crear`, `obtenerSaldo`, `obtenerCuenta`. | RF-17, 18, 20–24 |
| `backend/src/models/fiadoTransacciones.model.js` | Crear | `insertarCargo` y `insertarAnulacion` (reciben la conexión de la transacción; solo inserción), `listarPorCliente`. | RF-25, 43, 44 |
| `backend/src/models/productos.model.js` | Modificar | `listarVendibles` ya existe; se agrega `bloquearPorIds(conexion, ids)` (`FOR UPDATE`, ordenado por id). | RF-25, 29, 43 |
| `backend/src/controllers/ventas.controller.js` | Modificar | Orquesta carrito, confirmación, anulación, historial y detalle; se elimina `finalizarVenta` y `crear` (501). | RF-1–49 |
| `backend/src/controllers/clientes.controller.js` | Modificar | `buscarPorRut`, `registrar`, `cuenta` (el `listar` 501 queda para la spec de clientes y fiado). | RF-20–24 |
| `backend/src/controllers/productos.controller.js` | Modificar | `vendibles` (sin costo). | RF-2, 49 |
| `backend/src/routes/ventas.routes.js`, `clientes.routes.js`, `productos.routes.js` | Modificar | Rutas nuevas (tabla abajo). Rutas fijas antes de `/:id`. | — |
| `backend/src/tests/ventas.test.js` | Crear | Integración, archivo y base propios (`almacenpro_test_ventas`) para no chocar en paralelo, igual que 002. | RF-1–49 |
| `backend/src/tests/integracion.test.js` | Modificar | Los casos de spec 001 que usan `finalizar` pasan a `confirmar` con un carrito real. | spec 001 |
| `README.md`, `MEMORY.md` | Modificar (al cierre) | Endpoints, migración 004, estado y pendientes. | — |

Sin cambios: `app.js` (ya monta `/api/ventas` y `/api/clientes`), `middlewares/errores.js` (el `ER_DUP_ENTRY` queda de red de seguridad), `services/ventasVencidas.js`, `config/*`, `utils/inventario.js` (se reutiliza `cantidadValidaParaUnidad`, `redondearCantidad`, `armarMovimiento`, `estadoStock`).

**Rutas (todas exigen sesión):**

| Método y ruta | Acceso | Qué hace | RF |
| --- | --- | --- | --- |
| `GET /api/productos/vendibles?buscar=` | ambos | Solo activos, por nombre o código, sin costo. | RF-2, 49 |
| `GET /api/ventas/en-curso` | ambos | Ya existe; ahora trae `lineas`, `total` y `ultimaVenta` (su última venta confirmada, para recuperarse de un corte). | RF-12, 30 |
| `POST /api/ventas/:id/lineas` | dueño o admin | Agrega producto `{ producto_id, cantidad }`. | RF-3–8, 13 |
| `PATCH /api/ventas/:id/lineas/:productoId` | idem | Cambia cantidad. | RF-6, 7 |
| `DELETE /api/ventas/:id/lineas/:productoId` | idem | Quita una línea. | RF-6 |
| `DELETE /api/ventas/:id/lineas` | idem | Vacía el carrito. | RF-6 |
| `POST /api/ventas/:id/confirmar` | idem | `{ metodo_pago, cliente_id?, monto_recibido? }`. Reemplaza a `finalizar`. | RF-14–19, 25–34 |
| `POST /api/ventas/:id/cancelar` | idem | Ya existe. | RF-10 |
| `GET /api/ventas?desde=&hasta=&estado=` | administrador | Historial con `{ ventas, resumen }`. | RF-35–37, 40 |
| `GET /api/ventas/:id` | administrador | Detalle (completada, anulada o cancelada). | RF-38, 39 |
| `POST /api/ventas/:id/anular` | administrador | `{ motivo }`. | RF-42–48 |
| `GET /api/clientes/rut/:rut` | ambos | Cliente + saldo; **el cajero solo recibe `id`, `rut`, `nombre`, `saldo`**. 404 si no existe. | RF-17, 18, 22, 24 |
| `POST /api/clientes` | ambos | `{ rut, nombre? }`; 409 `RUT_REPETIDO` con el cliente existente. | RF-20, 21 |
| `GET /api/clientes/:id/cuenta` | administrador | Saldo, compras y fiados. | RF-23, 24 |

Se eliminan `POST /api/ventas/:id/finalizar` y `POST /api/ventas` (501): código nuevo no puede dejar 501 (principio 4). Un cajero que llama a una ruta de administrador recibe el 403 existente.

### Frontend

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `frontend/src/types/index.ts` | Modificar | `LineaVenta`, `VentaEnCurso`, `MetodoPago`, `ClienteVenta`, `ResumenHistorial`, `VentaHistorial`, `DetalleVentaCompleto`, `CuentaCliente`; se reemplazan los tipos provisorios `DetalleVenta`, `VentaNueva`, `VentaCancelada`. | todos |
| `frontend/src/utils/rut.ts` | Crear | Formato y validación del RUT al escribir (la validación que manda es la del backend). | RF-20, RNF-10 |
| `frontend/src/views/PuntoVentaView.tsx` | Reescribir | Pantalla de venta: buscador, carrito, cobro, resumen. | RF-1–34, RNF-1, 7 |
| `frontend/src/components/BuscadorProductos.tsx`, `CarritoVenta.tsx`, `PanelCobro.tsx`, `ResumenVentaConfirmada.tsx` | Crear | Piezas de la pantalla. `AvisoVentaPorExpirar` se mantiene. | idem |
| `frontend/src/components/IdentificarCliente.tsx` | Crear | Campo RUT, saldo, "en deuda", registro de cliente nuevo y omitir con una acción. | RF-17–22 |
| `frontend/src/views/HistorialVentasView.tsx` | Reescribir | Filtro por fecha (hoy por defecto), resumen, tabla con estado, detalle y anulación. | RF-35–39, 42–48 |
| `frontend/src/components/DetalleVentaModal.tsx`, `AnularVentaModal.tsx` | Crear | Detalle de cualquier venta cerrada; motivo obligatorio para anular. | RF-38, 39, 42 |
| `frontend/src/views/ClientesView.tsx` | Modificar | Búsqueda por RUT y cuenta del cliente (solo lo de esta spec). | RF-23 |
| `frontend/src/styles/ventas.css` | Crear | Estilos de la pantalla de venta (patrón de `inventario.css`; reutiliza `Modal`, `chip`, `boton`, `campo`, `alerta`). | RNF-5, 7 |

Para la interfaz de venta se usa la skill `frontend-design` (misma línea visual del rediseño de inventario). `package.json` no cambia.

---

## 2. Funciones puras de lógica

En `backend/src/utils/ventas.js` y `rut.js`. Ninguna lee reloj, base de datos ni red; la fecha llega como parámetro.

| Función | Qué decide | RF |
| --- | --- | --- |
| `calcularSubtotal(precio, cantidad)` | `precio × cantidad` redondeado al peso más cercano, medio peso hacia arriba. Usa enteros (milésimas) y `BigInt`: sin errores de coma flotante ni desbordes. | RF-11 |
| `calcularTotal(lineas)` | Suma de subtotales ya redondeados. | RF-11, 12 |
| `validarCantidadLinea({ cantidad, unidad, precio })` | Mayor que 0; entera en `unidad`, hasta 3 decimales en `kilo`; rechaza subtotal $0 con mensaje "pide una cantidad mayor". | RF-4, 13 |
| `evaluarStockAlAgregar({ stock, enCarrito, pedida, activo })` | Rechaza desactivado, agotado o cantidad total mayor al stock, indicando cuánto hay. | RF-7, 8 |
| `verificarCarritoParaConfirmar(lineas, productos)` | Devuelve todos los problemas: producto desactivado, sin stock suficiente (con lo que queda), carrito vacío. | RF-26, 27, 30 |
| `validarCobro({ metodoPago, total, montoRecibido, clienteId })` | Método válido; efectivo exige monto ≥ total y calcula el vuelto; fiado exige cliente. | RF-14–17 |
| `calcularVuelto(total, recibido)` | Diferencia, o lo que falta. Solo se muestra. | RF-15 |
| `puedeAnular(venta)` | Solo `completada`; ya anulada o no confirmada se rechaza. | RF-42, 45 |
| `normalizarMotivo(texto)` | Recorta; obligatorio; hasta 255. | RF-42 |
| `rangoDeFechas({ desde, hasta }, hoy)` | Valida `AAAA-MM-DD`, `desde ≤ hasta`; por defecto hoy; devuelve `[inicio, fin)` en hora local. | RF-36 |
| `armarResumenHistorial(grupos)` | Cuenta completadas, anuladas y canceladas; **suma el total solo de las completadas**. | RF-37, 48 |
| `estadoCuenta(saldo)` | `deuda`, `al_dia` o `a_favor` según el signo. | RF-18, 44 |
| `normalizarRut` / `esRutValido` / `formatearRut` | Quita puntos y espacios, `K` mayúscula; dígito verificador por módulo 11 (11→0, 10→K); formato `12.345.678-5`. | RF-20, RNF-10 |

---

## 3. Algoritmos en pseudocódigo

### A. Agregar o cambiar una línea (RF-3–8, 13)

```text
FUNCIÓN agregarLinea(usuario, ventaId, { productoId, cantidad }, hoy):
  venta = obtenerVentaEnCurso(ventaId, usuario)            // dueño o admin; 404/403 como hoy
  TRANSACCIÓN:
    SELECT venta ... FOR UPDATE                             // serializa ediciones del mismo carrito
    producto = SELECT ... FROM productos WHERE id           // sin bloquear: el stock no se reserva
    linea = SELECT ... FROM detalle_ventas WHERE venta y producto
    SI NO producto O NO activo: ROLLBACK; 409 "Este producto no está disponible"   // RF-8
    q = validarCantidadLinea(cantidad, unidad, precioEfectivo)                     // RF-4, 13
    SI linea: precio = linea.precio_unitario (se conserva, RF-5); nueva = linea.cantidad + q
    SINO:     precio = producto.precio_venta (se congela, RF-3);  nueva = q
    SI nueva > producto.stock: ROLLBACK; 409 "Solo quedan X de «nombre»"           // RF-7
    UPSERT detalle_ventas (cantidad = nueva, precio_unitario = precio,
                           subtotal = calcularSubtotal(precio, nueva))
    UPDATE ventas SET total = SUM(subtotal), ultima_actividad = hoy                // RF-9, 12
  COMMIT
  RESPONDER carrito completo
```

`PATCH` (fija la cantidad), `DELETE` de una línea y de todo el carrito siguen el mismo esquema: bloquean la venta, recalculan el total y registran actividad.

### B. Confirmar la venta (RF-14–19, 25–34)

```text
FUNCIÓN confirmarVenta(usuario, ventaId, { metodoPago, clienteId, montoRecibido }, hoy):
  venta = buscarPorId(ventaId); verificar dueño o admin
  SI venta.estado = 'completada': 409 { codigo: 'VENTA_YA_CONFIRMADA', venta: resumen }   // RF-30, caso límite del doble clic

  TRANSACCIÓN:
    venta = SELECT ... WHERE id AND estado = 'en_curso' FOR UPDATE
    SI NO venta: ROLLBACK; 409 "La venta ya no está en curso"                            // RF-30
    lineas = SELECT detalle_ventas WHERE venta
    productos = SELECT ... FROM productos WHERE id IN (...) ORDER BY id FOR UPDATE        // orden fijo: evita interbloqueos
    problemas = verificarCarritoParaConfirmar(lineas, productos)
    SI problemas: ROLLBACK; 409 { codigo: 'STOCK_INSUFICIENTE' | 'PRODUCTO_DESACTIVADO', problemas }   // RF-26, 27 (carrito intacto)
    total = calcularTotal(lineas)                           // se recalcula, no se confía en el guardado
    cobro = validarCobro({ metodoPago, total, montoRecibido, clienteId })
    SI cobro.error: ROLLBACK; 400 cobro.error                                            // RF-15, 17
    SI clienteId: cliente = clientes.buscarPorId(clienteId, conexion); SI NO existe: 400
    PARA CADA línea:
      UPDATE productos SET stock = stock - cantidad
      movimientosStock.insertar(armarMovimiento({ tipo: 'venta', ventaId, ... }))         // RF-25, 41
    UPDATE ventas SET estado = 'completada', metodo_pago, cliente_id, total, fecha = hoy   // RF-31
    SI metodoPago = 'fiado': fiado.insertarCargo(conexion, { clienteId, ventaId, monto: total, usuarioId })
    UPDATE usuarios SET token_version = token_version + 1 WHERE id = venta.usuario_id AND activo = 0   // spec 001 RF-15
  COMMIT                                                    // todo o nada (RF-28)
  RESPONDER { numero, total, metodo_pago, vuelto?, stock actualizado de cada producto }   // RF-31, 32
```

Cualquier excepción dentro de la transacción hace `ROLLBACK` y deja stock, detalle y deuda como estaban (RF-28); el carrito se conserva porque sigue `en_curso`.

### C. Anular una venta (RF-42–48)

```text
FUNCIÓN anularVenta(admin, ventaId, motivo, hoy):
  texto = normalizarMotivo(motivo); SI vacío: 400 "Escribe el motivo de la anulación"
  TRANSACCIÓN:
    venta = SELECT ... WHERE id FOR UPDATE
    SI NO puedeAnular(venta): ROLLBACK; 409 (ya anulada / no confirmada)                  // RF-45
    lineas = SELECT detalle_ventas WHERE venta
    productos = bloquearPorIds(ids, ORDER BY id)             // incluye desactivados: el stock se devuelve igual
    PARA CADA línea:
      UPDATE productos SET stock = stock + cantidad
      movimientosStock.insertar(armarMovimiento({ tipo: 'anulacion_venta', ventaId, nota: motivo }))
    SI venta.metodo_pago = 'fiado':
      fiado.insertarAnulacion(conexion, { clienteId, ventaId, monto: venta.total, usuarioId: admin })
      // el saldo puede quedar bajo cero: es saldo a favor, no un error (RF-44)
    UPDATE ventas SET estado = 'anulada', anulada_por, anulada_en = hoy, motivo_anulacion
  COMMIT
```

Sin plazo (RF-46). La venta anulada sigue en el historial y en la cuenta del cliente y no suma a los totales (RF-48).

### D. Historial, resumen y cuenta del cliente (RF-23, 35–39)

```text
FUNCIÓN historial(admin, { desde, hasta, estado }, hoy):
  rango = rangoDeFechas({ desde, hasta }, hoy)               // por defecto, hoy
  filas = SELECT v.*, u.nombre AS cajero, c.rut FROM ventas v ...
          WHERE v.estado <> 'en_curso' AND v.fecha >= rango.inicio AND v.fecha < rango.fin
          ORDER BY v.fecha DESC, v.id DESC
  grupos = SELECT estado, COUNT(*), SUM(total) ... GROUP BY estado    // misma condición, en SQL
  RESPONDER { ventas: filas, resumen: armarResumenHistorial(grupos) }
```

Detalle y cuenta usan JOIN con `detalle_ventas`, `productos` (nombre), `clientes` y `fiado_transacciones`. La cuenta lista compras (completadas y anuladas) y movimientos de fiado, de la más reciente a la más antigua, con el saldo de `v_saldo_fiado`.

### E. Cliente por RUT (RF-17–22)

```text
FUNCIÓN buscarPorRut(usuario, rutTexto):
  rut = normalizarRut(rutTexto); SI NO esRutValido(rut): 400 "El RUT no es válido, revisa el dígito verificador"
  cliente = clientes.buscarPorRut(rut); SI NO: 404
  saldo = clientes.obtenerSaldo(cliente.id)
  RESPONDER usuario.rol = 'administrador' ? { ...cliente, saldo, estado: estadoCuenta(saldo) }
                                          : { id, rut, nombre, saldo, estado }            // RF-24

FUNCIÓN registrar(usuario, { rut, nombre }):
  mismas validaciones; SI existe: 409 { codigo: 'RUT_REPETIDO', cliente }                 // RF-21
  INSERT clientes (rut, nombre o NULL); RESPONDER 201 { cliente }                          // RF-20
```

---

## 4. Cómo se pinta en la interfaz

### `/ventas` (cajero y administrador) (RF-1–34, RNF-1, 7)

- **Sin venta en curso:** un solo botón grande **Nueva venta**; debajo, `ResumenStock` (spec 002) y la última venta confirmada, si hay.
- **Con venta en curso, dos zonas:** a la izquierda **buscador** (foco automático; Enter agrega, escribir un código lo encuentra) con resultado de nombre, precio, unidad y stock; a la derecha el **carrito**: línea por producto con cantidad editable (coma en kilos), subtotal y quitar; **total grande** legible a distancia; botones **Vaciar** y **Cancelar venta**.
- **Cobrar:** botón **Cobrar** abre `PanelCobro`: método (Efectivo · Débito · Crédito · Fiado) con teclado; en efectivo, "Monto recibido" y **vuelto** en vivo (si falta, "Faltan $X" y confirmar deshabilitado); campo **RUT del cliente** con **Omitir** de una sola acción (RF-22). Con RUT: se busca; si existe muestra nombre (o el RUT) y **saldo**, destacando "En deuda: $X" (ámbar) o "Saldo a favor"; si no existe, se registra al instante (con "Nombre (opcional)") y se asocia. Con **Fiado**, omitir no está disponible y Confirmar exige cliente.
- **Errores al confirmar:** si falta stock, el carrito se conserva y cada línea problemática se marca con "Solo quedan X" o "Desactivado: quítalo" (RF-26, 27).
- **Resumen tras confirmar:** número de venta, total, método, vuelto y **stock actualizado** de lo vendido con las marcas de stock bajo o agotado (RF-31, 32); botón **Nueva venta**.
- **Aviso de inactividad:** se mantiene `AvisoVentaPorExpirar`; cada cambio cuenta como actividad (RF-9). Se retira el botón "Registrar actividad", que era solo de prueba.
- **Corte de conexión al confirmar:** al volver, se consulta `en-curso`; si ya no hay venta y `ultimaVenta` es reciente, se muestra su estado real para no cobrar dos veces. El botón se deshabilita mientras la petición está en vuelo (doble clic).
- **Cajero:** nunca ve costos, margen, historial ni cuentas (RF-49, RNF-9).

### `/historial-ventas` (solo administrador) (RF-35–39, 42–48)

- Filtro **Desde / Hasta** (por defecto hoy) y selector de estado. Franja de resumen: **ventas completadas y total del período**, y aparte **anuladas** y **canceladas** (no suman).
- Tabla: N.º, fecha y hora, cajero, método, total y etiqueta de estado (`Completada`, `Anulada`, `Cancelada`, `Cancelada por inactividad`); fila atenuada si no está completada. Clic abre `DetalleVentaModal`.
- **Detalle:** productos, cantidades, precio congelado, subtotal, total, método, cliente (RUT), cajero; en anuladas, quién, cuándo y por qué; en canceladas, causa, hora de inicio y fin, carrito y la leyenda "No afectó el stock ni la deuda". Botón **Anular venta** solo en completadas: pide motivo (obligatorio) y confirma; muestra el aviso de saldo a favor si corresponde.

### `/clientes` (administrador) (RF-23)

- Campo **RUT** → cuenta del cliente: saldo (deuda, al día o a favor), compras y movimientos de fiado. El listado de deudores y los abonos siguen "no disponibles" (spec de clientes y fiado).

---

## 5. Decisiones técnicas justificadas

| Decisión | Por qué | Alternativa descartada | RF |
| --- | --- | --- | --- |
| El carrito vive en `detalle_ventas` de la venta `en_curso` | Una sola tabla de líneas: al confirmar ya están, y al cancelar quedan como seguimiento sin guardar nada extra. | Carrito en memoria del navegador: se pierde con el cierre y no deja rastro de las canceladas. Tabla `carritos` aparte: copiar al confirmar. | RF-10, 35, 39 |
| Precio congelado al agregar; la línea existente conserva el suyo | Es la regla de la spec y de la constitución. | Releer el precio al confirmar. | RF-3, 5 |
| `detalle_ventas.cantidad` a `DECIMAL(10,3)` con `UNIQUE (venta_id, producto_id)` | Kilos exactos y "un producto, una línea" garantizado por la base. | Gramos en entero: confunde al dueño. | RF-4, 5 |
| Subtotal con enteros y `BigInt` | `0,35 kg × $1.590 = $556,5` debe dar $557 siempre. | `Math.round(precio * cantidad)`: errores de coma flotante en el medio peso. | RF-11 |
| Estado nuevo `cancelada` además de `cancelada_automaticamente` | Cancelar a mano ya no se confunde con anular; el historial dice la causa. La migración reclasifica las `anulada` viejas. | Reutilizar `anulada` para ambas: contradice la spec. Renombrar el estado automático: rompe la spec 001. | RF-10, 35 |
| `fecha` = momento de cierre (confirmar o cancelar) | Un solo campo indexado sirve para el filtro por fecha. | Filtrar con `COALESCE` de varias fechas: sin índice con 50.000 ventas. | RF-36, RNF-4 |
| RUT guardado sin puntos y `NOT NULL UNIQUE`; `nombre` opcional | El RUT es el único identificador (decisión de la spec); la unicidad no depende del formato. | Guardar con puntos: `12.345.678-5` y `12345678-5` serían dos clientes. | RF-20, 21, RNF-10 |
| Cliente en dos pasos: `GET /clientes/rut/:rut` y `POST /clientes` | Cumple RF-21 (decir quién es) y deja a la pantalla mostrar el saldo antes de cobrar. | Un "buscar o crear" mudo: no permite ofrecer el cliente existente. | RF-17, 21, 22 |
| Tipo `anulacion` en `fiado_transacciones` | Los abonos siguen siendo pagos reales; la spec de fiado podrá reportar lo cobrado sin mezclas (decidido contigo). | Anular con un `abono`: ensucia los pagos. | RF-43, 44 |
| `UNIQUE (venta_id, tipo)` en fiado | Red de seguridad: ni doble cargo ni doble anulación aunque falle una validación. | Confiar solo en el estado de la venta. | RF-30, 45 |
| Bloqueo `FOR UPDATE` de la venta y luego de los productos **ordenados por id** | Serializa ventas, anulaciones y ajustes sobre el mismo producto y evita interbloqueos. Cumple el contrato que dejó la spec 002 (RF-27 de esa spec). | Descontar con `UPDATE ... WHERE stock >= x` sin leer: pierde el "stock antes" auditable y el mensaje con lo que queda. | RF-25, 29 |
| El stock se revisa al agregar y se rechaza **toda** la venta al confirmar | Decidido en la spec; no se vende "lo que alcance". | Reservar stock en el carrito: fuera de alcance. | RF-7, 26 |
| `monto_recibido` se valida pero no se guarda | La interfaz no es la autoridad; el vuelto se devuelve en la respuesta. | Guardarlo: fuera de alcance. | RF-15 |
| Se eliminan `finalizar` y `POST /ventas` (501) y se amplía la lista blanca de rutas | Hay una sola forma de terminar una venta; el cajero desactivado puede cobrar la que tenía. | Mantener `finalizar`: dejaría cerrar sin descontar stock. | RF-30; spec 001 |
| Historial resumido en SQL (`GROUP BY estado`) con la regla en una función pura | 50.000 ventas sin traer todas las filas; una sola regla ("solo suman las completadas"). | Sumar en React o en el controlador sobre todas las filas. | RF-37, RNF-4 |
| Rango de fechas en hora local del servidor, como ya hace el proyecto (`dateStrings`) | Coherente con `ventasVencidas` y el resto de las fechas. | Convertir a UTC: desfases de día. | RF-36 |
| Sin librerías nuevas; `node --test` y verificación manual de interfaz | Principio 1; igual que 001 y 002. | Vitest o Testing Library. | todos |

---

## 6. Estrategia de pruebas

### 6.1 Pruebas unitarias (`npm test`)

| Prueba | Función | RF |
| --- | --- | --- |
| 0,35 kg × $1.590 = $557; medio peso hacia arriba; precios y cantidades grandes sin desborde | `calcularSubtotal` | RF-11 |
| Total = suma de subtotales ya redondeados (no redondeo del total) | `calcularTotal` | RF-11 |
| Entero en unidad, 3 decimales en kilo, 0 y negativos fuera, subtotal $0 pide más cantidad | `validarCantidadLinea` | RF-4, 13 |
| Desactivado, agotado, suma con lo ya en el carrito mayor al stock | `evaluarStockAlAgregar` | RF-7, 8 |
| Carrito vacío, producto desactivado y faltantes con lo que queda | `verificarCarritoParaConfirmar` | RF-26, 27, 30 |
| Efectivo menor al total, fiado sin cliente, método inválido; vuelto | `validarCobro`, `calcularVuelto` | RF-14–17 |
| Solo `completada` se anula; motivo vacío o solo espacios | `puedeAnular`, `normalizarMotivo` | RF-42, 45 |
| Fechas por defecto, rango invertido, formato inválido | `rangoDeFechas` | RF-36 |
| Solo las completadas suman; anuladas y canceladas se cuentan aparte | `armarResumenHistorial` | RF-37, 48 |
| Deuda, al día y a favor | `estadoCuenta` | RF-18, 44 |
| RUTs válidos (con K y con 0), dígito incorrecto, con y sin puntos, formato de salida | `rut.js` | RF-20, RNF-10 |
| La lista blanca de rutas de una venta en curso incluye carrito, confirmar, cancelar y clientes, y no `iniciar` | `esRutaDeVentaEnCurso` | spec 001 |

### 6.2 Pruebas de integración (`npm run test:integracion`, MySQL real, base `almacenpro_test_ventas`)

| Escenario | RF |
| --- | --- |
| Armar una venta con producto por unidad y por kilo: total y subtotales; precio congelado aunque el administrador lo cambie | RF-3, 11, 12 |
| Agregar el mismo producto suma en una línea con el primer precio | RF-5 |
| Cantidad mayor al stock, producto desactivado y agotado se rechazan con mensaje | RF-7, 8 |
| Cada cambio del carrito actualiza `ultima_actividad` | RF-9 |
| Cancelar a mano y cancelación por inactividad dejan la venta con su carrito, sin tocar stock ni deuda | RF-10 |
| Confirmar descuenta stock, guarda detalle, movimiento `venta` con `venta_id` y total; el stock no queda negativo | RF-25, 31, 32, 41 |
| Si el stock bajó antes de confirmar, se rechaza **toda** la venta y el carrito queda intacto | RF-26 |
| Producto desactivado en el carrito bloquea la confirmación | RF-27 |
| **Reversa total:** si falla la inserción del movimiento (usuario inexistente) no cambia stock, detalle ni deuda | RF-28; RNF-3 |
| **Dos ventas simultáneas** (`Promise.all`) del último producto: una confirma, la otra recibe 409; stock final 0 | RF-29 |
| **Venta y ajuste manual simultáneos** del mismo producto: nunca queda negativo (cierra el criterio pendiente de la spec 002) | spec 002 RF-27 |
| Confirmar vacía o dos veces la misma venta: 409 y una sola venta registrada | RF-30 |
| Efectivo con monto menor al total se rechaza; devuelve vuelto; débito y crédito sin monto | RF-14–16 |
| Fiado sin cliente se rechaza; con cliente crea el cargo por el total; el saldo sube | RF-17, 25 |
| Cliente con deuda previa: se vende igual y el saldo lo refleja; ventas con débito asociadas al RUT quedan en su cuenta | RF-18, 22, 23 |
| Registrar cliente con solo RUT válido (con y sin nombre); RUT inválido 400; RUT repetido 409 con el cliente (aunque se escriba con otro formato) | RF-20, 21; RNF-10 |
| Cajero no puede modificar saldos ni ver la cuenta (403); la búsqueda por RUT le devuelve solo `id`, `rut`, `nombre`, `saldo` | RF-19, 24 |
| Costo y margen no viajan en `vendibles`, `en-curso` ni la confirmación para el cajero | RF-49; RNF-9 |
| Historial: por defecto hoy; rango; incluye completadas, anuladas y canceladas; total solo de completadas; cajero recibe 403 | RF-35–37, 40 |
| Detalle de completada, anulada y cancelada con los datos de la spec | RF-38, 39 |
| Anular: motivo obligatorio; devuelve stock con movimiento `anulacion_venta`; marca quién, cuándo y por qué; no se anula dos veces; cajero 403; con producto desactivado y con cajero desactivado funciona; sin plazo | RF-42–47 |
| Anular una venta fiada: baja el saldo; con abonos previos queda **saldo a favor** sin error; la conciliación cargos − abonos − anulaciones = saldo se cumple | RF-43, 44; RNF-3 |
| Cierre de la venta de un cajero desactivado: puede armar y confirmar su venta pero no iniciar otra; al confirmar pierde el acceso | spec 001 RF-15 |
| Migración: bases viejas con `anulada` pasan a `cancelada`, kilos conservan valores y clientes sin RUT detienen el script | migración |
| Mensajes principales en español | RNF-6 |

Las de spec 001 (`integracion.test.js`) se ajustan para confirmar con un carrito real en lugar de `finalizar`.

### 6.3 Verificación manual y de rendimiento (entorno de prueba aparte)

| Verificación | RF |
| --- | --- |
| Venta típica de 5 productos en efectivo en menos de 30 s, solo con teclado y otra vez táctil (reloj en mano) | RNF-1, 7 |
| Producto por kilo con coma; total y línea correctos; $0 se rechaza | RF-4, 11, 13 |
| Efectivo con vuelto y con monto insuficiente; débito y crédito | RF-14–16 |
| RUT existente, RUT nuevo con y sin nombre, RUT inválido, omitir con una acción; fiado sin RUT bloqueado; cliente en deuda destacado | RF-17–22 |
| Stock que baja desde otra pestaña antes de confirmar: se rechaza todo y se corrige el carrito | RF-26 |
| Doble clic en Confirmar y corte de red: una sola venta | RF-30 |
| Historial: filtro por fecha, resumen, detalle de cada estado, anulación con motivo y aviso de saldo a favor | RF-35–48 |
| Cuenta del cliente desde `/clientes` | RF-23 |
| Cajero: sin costos, historial ni cuentas, ni por pantalla ni por URL directa | RF-24, 40, 47, 49 |
| Montos `$1.490`, kilos `0,35 kg`, todo en español | RNF-5, 6 |
| `tsc --noEmit` y `vite build` sin errores | RNF-5 |
| Con 5.000 productos y 5.000 clientes: buscar, agregar, confirmar y buscar RUT en menos de 2 s; historial con 50.000 ventas en menos de 2 s | RNF-2, 4 |

---

## Secuencia de implementación

1. Funciones puras (`ventas.js`, `rut.js`) y sus pruebas unitarias.
2. Migración 004 y `schema.sql`; actualizar el principio 5 de la constitución.
3. Modelos: clientes, fiado, bloqueo de productos y carrito en `ventas.model.js`.
4. Modelo de confirmar, anular, historial y detalle.
5. Controladores y rutas (carrito, clientes, vendibles); lista blanca de sesión; retirar `finalizar` y `crear`.
6. Controladores y rutas de confirmar, anular e historial.
7. Tipos, `rut.ts` y pantalla de venta (buscador, carrito).
8. Cobro, identificación del cliente y resumen.
9. Historial, detalle, anulación y cuenta del cliente.
10. Pruebas de integración y ajuste de las de spec 001.
11. Checklist manual, rendimiento, `README.md` y `MEMORY.md`; marcar la spec como implementada.

(El detalle por tarea, con su criterio de "hecho cuando", va en `tasks.md`.)

## Riesgos y cuidados

- **Migración sobre datos reales:** convierte tipos y estados. Se exige respaldo y no la ejecuto en `almacenpro` sin tu visto bueno; las pruebas usan su propia base. Verifica antes: clientes sin RUT (detiene el script) y ventas `anulada` (deben ser todas cancelaciones manuales).
- **Interbloqueos:** todas las transacciones toman primero la fila de la venta y luego los productos ordenados por id; se prueba con ventas, anulaciones y ajustes simultáneos.
- **Dinero y kilos:** `mysql2` devuelve `DECIMAL` como texto; los modelos convierten a número, como en 002.
- **Cambio de forma de `GET /api/ventas`:** pasa a `{ ventas, resumen }`; solo lo consume el historial, que se reescribe. Se ajusta la prueba que lo use.
- **Cajero desactivado:** se amplía la lista blanca; hay prueba para que `iniciar` siga bloqueado.
- **Retiro de `finalizar`:** cualquier prueba o pantalla que lo llame se actualiza en el mismo cambio; no queda rastro.
- **Hora local:** el filtro por día depende de la zona del servidor, igual que el resto del proyecto.
- **No tocar lo del usuario:** las pruebas manuales usan puertos y base propios; el servidor del usuario (4000/5173) y `almacenpro` no se usan.
