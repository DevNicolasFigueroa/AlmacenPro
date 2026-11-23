# Plan 004 - Clientes y fiado

**Estado:** borrador (espera aprobación)

## Estado actual y enfoque

La spec 003 dejó el fiado a medias: la venta al fiado crea el cargo y su anulación crea una anulación, pero **nadie puede cobrar** la deuda. Lo que existe hoy:

- **Clientes:** `clientes.model.js` solo busca por RUT o id, crea con RUT (nombre opcional) y calcula el saldo con la vista `v_saldo_fiado`. La tabla ya tiene `telefono`, `email` y `direccion`, pero nada los escribe.
- **Cuenta:** `GET /api/clientes/:id/cuenta` y `GET /api/clientes` exigen administrador; este último responde 501. En el frontend, `/clientes` es solo del administrador y busca por RUT.
- **Fiado:** `fiado_transacciones` solo conoce `cargo`, `abono` y `anulacion`. Ningún código inserta abonos; la prueba de anulación de la spec 003 los inserta a mano.
- **Sesión con venta en curso:** la lista blanca de rutas de un cajero desactivado incluye solo `GET /clientes/rut/:rut` y `POST /clientes`.

Este plan es **incremental** y cubre toda la spec 004 (RF-1 a RF-27, RNF-1 a RNF-8). Respeta la constitución: capas `routes → controllers → models`, cada escritura de dinero en una transacción, español y CLP sin decimales, y **sin librerías nuevas**.

### Brechas detectadas

| Brecha | Estado actual | RF |
| --- | --- | --- |
| Registrar abonos | No existe; no hay método de pago del abono | RF-10 a RF-15 |
| Anular abonos | No existe el tipo ni la referencia al abono anulado | RF-16 a RF-19 |
| Saldo | La vista no suma las anulaciones de abono | RF-26 |
| Listado y búsqueda | `GET /api/clientes` responde 501; no hay filtro por estado ni orden por deuda ni paginación | RF-1 a RF-6 |
| Cuenta para el Cajero | Rutas y pantalla solo para el administrador; el cajero solo recibe identidad y saldo | RF-7 a RF-9 |
| Abrir la cuenta desde la venta | La pantalla de cobro solo muestra el saldo | RF-8 |
| Datos del cliente | No hay edición de nombre, teléfono, correo ni dirección | RF-20 |
| Corregir el RUT | No existe, ni su registro de cambios | RF-21 a RF-25 |
| Total por cobrar | No existe | RF-6 |

### Fuera de alcance de este plan

Lo que dice la spec: límite de crédito, desactivar o fusionar clientes, cobranza, intereses, abonos por venta, devolución de saldo a favor, comprobantes, importaciones y reportes. La columna `limite_fiado` **no se borra** (borrarla no aporta y arriesga datos); simplemente nada la usa.

### Interpretaciones que conviene confirmar

- **Anular un abono es un movimiento nuevo (`anulacion_abono`)**, no un cambio ni un borrado del abono: igual que la anulación de venta, el abono queda visible, marcado como anulado, y la conciliación sigue siendo suma de movimientos.
- **El Cajero abre el detalle de cada compra de la cuenta**, pero solo de las ventas de ese cliente y por una ruta propia de la cuenta (`GET /api/clientes/:id/compras/:ventaId`). `GET /api/ventas/:id` y el historial siguen siendo del administrador. El detalle ya no trae costos ni márgenes, y no incluye el botón de anular para el cajero.
- **Un solo formato de cliente para ambos roles:** la búsqueda por RUT de la venta ahora devuelve también el contacto al cajero, porque la cuenta ya no es reservada.
- **Monto máximo de un abono: $99.999.999.** Evita desbordes de la columna y errores de tipeo; se ajusta si el almacén lo necesita.
- **Listado de 25 clientes por página**, con búsqueda y filtros en el servidor.

---

## 1. Archivos que se crean o modifican

### Documentos (primera tarea)

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `specs/004-clientes-y-fiado/` (`spec.md`, `plan.md`, `tasks.md`) | Agregar al repositorio | Los tres archivos de la spec, en el commit de la primera tarea | — |
| `specs/001-autenticacion-y-roles/spec.md` | Modificar | RF-12 y RF-13 reemplazados | RF-9 |
| `specs/003-ventas-pos/spec.md` | Modificar | RF-19, RF-23, RF-24, RF-38 (detalle desde la cuenta del cliente), "Usuarios / actores" del Cajero y criterio sobre la cuenta | RF-7, RF-9 |
| `docs/CONSTITUTION.md` | Modificar | Principio 5: cargos − abonos − anulaciones de venta + anulaciones de abono = saldo | RF-26 |

### Base de datos

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `backend/database/migration_005_spec004.sql` | Crear | Para bases existentes (una sola vez, con respaldo): ver detalle abajo | RF-10, 16, 24, 26 |
| `backend/database/schema.sql` | Modificar | Mismos cambios para bases nuevas (las pruebas cargan este archivo) | idem |

**Cambios de esquema:**

- `fiado_transacciones.tipo`: agregar `anulacion_abono`.
- `fiado_transacciones.metodo_pago` (`efectivo`, `debito`, `credito`, `transferencia`, nulo): solo lo llevan los abonos.
- `fiado_transacciones.abono_anulado_id` (FK al mismo movimiento, nulo): solo lo lleva la anulación de abono. **`UNIQUE (abono_anulado_id)`**: un abono se anula una sola vez aunque fallen las validaciones o haya dos clics a la vez.
- `fiado_transacciones`: `CHECK (monto > 0)` como red de seguridad. La migración se detiene si hay montos no positivos.
- Tabla nueva `cambios_rut`: `id`, `cliente_id` (FK), `rut_anterior`, `rut_nuevo`, `usuario_id` (FK), `creado_en`; índice `(cliente_id, creado_en)`. Solo se inserta.
- `v_saldo_fiado`: cargo y anulación de abono suman; abono y anulación de venta restan.
- Sin cambios en `clientes`: el nombre, teléfono, correo y dirección ya existen, y el RUT ya es `UNIQUE`.

### Backend

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `backend/src/utils/clientes.js` + `clientes.test.js` | Crear | Funciones puras de la sección 2 (`npm test` recoge `src/utils/*.test.js`) | RF-2, 10 a 12, 16, 20, 26 |
| `backend/src/models/fiadoTransacciones.model.js` | Modificar | `insertarAbono`, `insertarAnulacionAbono`, `buscarAbonoParaAnular` (con bloqueo), `listarPorCliente` con la marca de abono anulado y el método | RF-10 a 19, 26, 27 |
| `backend/src/models/clientes.model.js` | Modificar | `listar` (búsqueda, estado, orden, página y resumen), `actualizarDatos`, `cambiarRut` (transacción), `bloquearPorId`, `obtenerCuenta` con contacto y, para el administrador, los cambios de RUT; `buscar*` devuelven el contacto | RF-1 a 7, 20 a 25 |
| `backend/src/models/cambiosRut.model.js` | Crear | `insertar(conexion, …)` y `listarPorCliente` (solo inserción y lectura) | RF-24, 25 |
| `backend/src/controllers/clientes.controller.js` | Modificar | `listar`, `cuenta` (ambos roles), `detalleCompra`, `actualizar`, `cambiarRut`, `registrarAbono`, `anularAbono`; `armarCliente` ya no distingue rol; se elimina el 501 | RF-1 a 27 |
| `backend/src/routes/clientes.routes.js` | Modificar | Rutas nuevas (tabla abajo); rutas fijas antes de `/:id` | — |
| `backend/src/tests/clientes.test.js` | Crear | Integración con archivo y base propios (`almacenpro_test_clientes`), como las specs 002 y 003 | RF-1 a 27 |
| `backend/src/tests/ventas.test.js` | Modificar | El cajero ahora ve la cuenta (hoy espera 403); los abonos de la prueba de anulación pasan por la ruta real | RF-7, 9 |
| `backend/src/utils/validaciones.test.js` | Modificar | La lista blanca de un cajero desactivado **no** incluye las rutas nuevas | caso límite |
| `README.md`, `MEMORY.md`, `AGENTS.md` | Modificar (al cierre) | Endpoints, migración 005, estado y pendientes | — |

Sin cambios: `app.js`, `middlewares/*`, `services/*`, `utils/rut.js` (se reutiliza) y la lista blanca de `utils/validaciones.js`.

**Rutas (todas exigen sesión; cajero y administrador salvo lo marcado):**

| Método y ruta | Acceso | Qué hace | RF |
| --- | --- | --- | --- |
| `GET /api/clientes?buscar=&estado=&orden=&pagina=` | ambos | Listado paginado con saldo y estado; el administrador recibe además `resumen` (cantidad en deuda y total por cobrar) | RF-1 a 6 |
| `GET /api/clientes/rut/:rut` | ambos | Ya existe; ahora devuelve también el contacto | RF-7 |
| `POST /api/clientes` | ambos | Ya existe (registro solo con RUT) | spec 003 |
| `GET /api/clientes/:id/cuenta` | ambos | Cliente, saldo, compras y movimientos; solo al administrador, además, `cambios_rut` | RF-7, 25 |
| `GET /api/clientes/:id/compras/:ventaId` | ambos | Detalle de una compra completada o anulada **de ese cliente** (productos, precios congelados, subtotales, método, cajero y datos de la anulación); 404 si la venta es de otro cliente o no está cerrada como completada o anulada | RF-7, 9 |
| `PATCH /api/clientes/:id` | ambos | Nombre, teléfono, correo y dirección; vacío borra el dato | RF-20 |
| `PATCH /api/clientes/:id/rut` | ambos | `{ rut, confirmar }`; sin `confirmar: true` responde con el aviso y no cambia nada | RF-21 a 24 |
| `POST /api/clientes/:id/abonos` | ambos | `{ monto, metodo_pago, observacion?, confirmar_saldo_a_favor? }` | RF-10 a 15 |
| `POST /api/clientes/:id/abonos/:abonoId/anular` | administrador | `{ motivo }` | RF-16 a 19 |

El cajero que llama a la ruta de anular recibe el 403 existente (RF-19). Los abonos no se editan ni se borran: no existen rutas para eso (RF-15).

### Frontend

| Archivo | Tipo | Responsabilidad | RF |
| --- | --- | --- | --- |
| `frontend/src/types/index.ts` | Modificar | `MovimientoFiado` con `anulacion_abono`, método y marca de anulado; `ClienteCuenta` (con contacto); `ResumenClientes`, `CambioRut`; se retiran los tipos provisorios `Cliente` y `SaldoFiado` si nada los usa | todos |
| `frontend/src/utils/formato.ts` | Modificar | Nombres de los métodos de abono y de los movimientos | RNF-4 |
| `frontend/src/views/ClientesView.tsx` | Reescribir | Listado: buscador, filtro por estado, orden, tabla paginada, resumen del administrador y "Registrar cliente" cuando no hay resultados con un RUT válido | RF-1 a 6 |
| `frontend/src/views/CuentaClienteView.tsx` | Crear | Ruta `/clientes/:id`: envuelve el contenido de la cuenta | RF-7 |
| `frontend/src/components/CuentaCliente.tsx` | Crear | Contenido de la cuenta (saldo, estado, contacto, compras, movimientos, acciones); lo usan la ruta y el modal de la venta | RF-5, 7, 8 |
| `frontend/src/components/DetalleVentaModal.tsx` | Modificar | Recibe de dónde leer el detalle: el historial usa `/ventas/:id` y la cuenta usa `/clientes/:id/compras/:ventaId`; el botón de anular solo aparece desde el historial | RF-7, 9 |
| `frontend/src/components/AbonoModal.tsx` | Crear | Monto, método, observación; muestra el saldo antes y el saldo que quedará; aviso y confirmación si queda a favor; resumen al terminar | RF-10 a 14; RNF-1 |
| `frontend/src/components/AnularAbonoModal.tsx` | Crear | Motivo obligatorio (solo administrador) | RF-16 a 18 |
| `frontend/src/components/EditarClienteModal.tsx` | Crear | Nombre y contacto | RF-20 |
| `frontend/src/components/CambiarRutModal.tsx` | Crear | Nuevo RUT, aviso de que todo pasa al RUT nuevo y confirmación; indica quién tiene el RUT si ya existe | RF-21 a 23 |
| `frontend/src/components/IdentificarCliente.tsx` | Modificar | Botón "Ver cuenta" que abre la cuenta sin salir de la venta, refresca el saldo al volver y registra actividad de la venta tras un abono | RF-8 |
| `frontend/src/App.tsx` | Modificar | `/clientes` y `/clientes/:id` para ambos roles; enlace "Clientes y fiado" en el menú del cajero | RF-1, 7 |
| `frontend/src/styles/clientes.css` | Crear | Estilos del listado y la cuenta (patrón de `ventas.css` e `inventario.css`; reutiliza `Modal`, `chip`, `boton`, `campo`, `alerta`) | RNF-6 |

Para la interfaz se usa la skill `frontend-design`, con la misma línea visual de inventario y ventas. `package.json` no cambia.

---

## 2. Funciones puras de lógica

En `backend/src/utils/clientes.js`. Ninguna lee reloj, base de datos ni red.

| Función | Qué decide | RF |
| --- | --- | --- |
| `validarMontoAbono(monto)` | Entero en pesos, mayor que 0 y de hasta $99.999.999; rechaza decimales, texto y negativos con un mensaje que dice qué corregir | RF-10 |
| `validarMetodoAbono(metodo)` | Solo `efectivo`, `debito`, `credito` o `transferencia` | RF-10 |
| `evaluarAbono({ saldo, monto })` | Devuelve `saldoResultante`, `quedaAFavor` (cuánto) y `requiereConfirmacion` (el monto supera la deuda, también si el cliente está al día o a favor) | RF-11, 12 |
| `calcularSaldo(movimientos)` | Cargo y anulación de abono suman; abono y anulación de venta restan. Es la regla de conciliación del principio 5 | RF-26; RNF-3 |
| `puedeAnularAbono(movimiento, yaAnulado)` | Solo un movimiento de tipo `abono` y que no esté anulado | RF-16, 17 |
| `normalizarMotivo(texto)` | Ya existe en `utils/ventas.js`; se reutiliza con el mismo tope de 255 | RF-16 |
| `normalizarObservacion(texto)` | Opcional, recortada, hasta 255 | RF-10 |
| `validarDatosCliente(datos)` | Nombre (150), teléfono (20; dígitos, espacios, `+`, `-`, paréntesis), correo (formato y 120) y dirección (200); texto vacío pasa a nulo (borra el dato); solo valida lo que viene en la petición | RF-20 |
| `interpretarBusqueda(texto)` | Recorta y devuelve `{ texto, rut }` donde `rut` es la forma sin puntos ni espacios para buscar por RUT parcial (o `null` si lo escrito no puede ser parte de un RUT) | RF-2 |
| `validarFiltroListado({ estado, orden, pagina })` | Estados `todos`, `deuda`, `a_favor`, `al_dia`; orden `nombre` o `deuda` (por defecto `deuda` con el filtro "en deuda"); página entera mayor o igual a 1 | RF-3, 4 |
| `estadoCuenta(saldo)` | Ya existe en `utils/ventas.js`; se reutiliza | RF-5 |

---

## 3. Algoritmos en pseudocódigo

### A. Registrar un abono (RF-10 a RF-15)

```text
FUNCIÓN registrarAbono(usuario, clienteId, { monto, metodoPago, observacion, confirmarSaldoAFavor }, hoy):
  montoValido = validarMontoAbono(monto); metodo = validarMetodoAbono(metodoPago)   // 400 con mensaje
  nota = normalizarObservacion(observacion)
  TRANSACCIÓN:
    cliente = SELECT id FROM clientes WHERE id = clienteId FOR UPDATE     // serializa abonos y cambios del mismo cliente
    SI NO cliente: ROLLBACK; 404 "No se encontró el cliente"
    saldo = SUM de sus movimientos (misma regla que v_saldo_fiado)         // se recalcula dentro de la transacción
    evaluacion = evaluarAbono({ saldo, monto: montoValido })
    SI evaluacion.requiereConfirmacion Y NO confirmarSaldoAFavor:
      ROLLBACK; 409 { codigo: 'ABONO_SUPERA_DEUDA', saldo, quedaAFavor }   // RF-12: la pantalla pide confirmar
    id = insertarAbono(conexion, { clienteId, usuarioId, monto, metodoPago: metodo, observacion: nota, hoy })
  COMMIT                                                                    // todo o nada (RF-13, 14)
  RESPONDER 201 { abono, saldoAnterior: saldo, saldoNuevo: evaluacion.saldoResultante, estado }
```

El saldo se recalcula en el servidor: aunque la pantalla mostrara un saldo viejo (por ejemplo, otra persona abonó mientras tanto), la advertencia y la confirmación se deciden con el saldo real. El `FOR UPDATE` sobre la fila del cliente serializa dos abonos simultáneos del mismo cliente. Si la inserción falla, nada cambia (RF-14).

### B. Anular un abono (RF-16 a RF-19)

```text
FUNCIÓN anularAbono(admin, clienteId, abonoId, motivo, hoy):
  texto = normalizarMotivo(motivo)                     // obligatorio, hasta 255
  TRANSACCIÓN:
    SELECT id FROM clientes WHERE id = clienteId FOR UPDATE
    abono = SELECT ... FROM fiado_transacciones WHERE id = abonoId AND cliente_id = clienteId FOR UPDATE
    SI NO abono: ROLLBACK; 404
    yaAnulado = EXISTS (SELECT 1 FROM fiado_transacciones WHERE abono_anulado_id = abonoId)
    SI NO puedeAnularAbono(abono, yaAnulado): ROLLBACK; 409 "Ese abono ya está anulado" / "Solo se anulan abonos"
    insertarAnulacionAbono(conexion, { clienteId, usuarioId: admin, monto: abono.monto, abonoAnuladoId: abonoId,
                                       observacion: texto, hoy })
  COMMIT
  RESPONDER { saldoNuevo, estado }
```

El abono original no se modifica: la anulación es un movimiento nuevo que lo referencia, y `UNIQUE (abono_anulado_id)` impide anularlo dos veces aunque lleguen dos solicitudes a la vez (el segundo choque se traduce a 409). No hay plazo (RF-18).

### C. Corregir el RUT (RF-21 a RF-25)

```text
FUNCIÓN cambiarRut(usuario, clienteId, { rut, confirmar }, hoy):
  nuevo = leerRut(rut)                                  // 400 si no es válido (reutiliza utils/rut.js)
  TRANSACCIÓN:
    cliente = SELECT ... FROM clientes WHERE id = clienteId FOR UPDATE
    SI NO cliente: ROLLBACK; 404
    SI cliente.rut = nuevo: ROLLBACK; 400 "Ese ya es el RUT del cliente"
    otro = SELECT id, nombre, rut FROM clientes WHERE rut = nuevo
    SI otro: ROLLBACK; 409 { codigo: 'RUT_REPETIDO', cliente: quién es }     // RF-22, sin fusionar
    SI NO confirmar:
      ROLLBACK; 409 { codigo: 'CONFIRMACION_REQUERIDA', mensaje: "Todas las compras, los fiados y el saldo
                      pasarán al RUT nuevo", compras, saldo }                  // RF-23
    UPDATE clientes SET rut = nuevo WHERE id = clienteId
    cambiosRut.insertar(conexion, { clienteId, anterior: cliente.rut, nuevo, usuarioId, hoy })   // RF-24
  COMMIT
  RESPONDER cliente actualizado
```

Compras, fiados y saldo cuelgan de `cliente_id`, no del RUT, así que **no se copia ni se mueve nada**: cambiar la columna basta (RF-24) y una venta en curso del cliente sigue asociada (caso límite). Si dos personas intentan el mismo RUT a la vez, el índice `UNIQUE` rechaza la segunda (`ER_DUP_ENTRY` → 409 `RUT_REPETIDO`).

### D. Listado y búsqueda (RF-1 a RF-6)

```text
FUNCIÓN listarClientes(usuario, { buscar, estado, orden, pagina }):
  filtro = validarFiltroListado(...); busqueda = interpretarBusqueda(buscar)
  base = clientes c LEFT JOIN (saldo por cliente, calculado desde fiado_transacciones) s ON s.cliente_id = c.id
  donde = []
  SI busqueda.texto: donde += (c.nombre LIKE %texto% OR c.rut LIKE %rut%)       // la colación ya ignora mayúsculas y tildes
  SEGÚN estado: deuda → saldo > 0; a_favor → saldo < 0; al_dia → saldo = 0
  filas = SELECT c.id, c.rut, c.nombre, c.telefono, saldo FROM base WHERE donde
          ORDER BY (deuda: saldo DESC, nombre) | (nombre: nombre IS NULL, nombre, rut)
          LIMIT 25 OFFSET (pagina - 1) * 25
  total = SELECT COUNT(*) FROM base WHERE donde
  SI usuario.rol = 'administrador':
    resumen = SELECT COUNT(*), SUM(saldo) FROM base WHERE saldo > 0           // no se compensa con saldos a favor
  RESPONDER { clientes, total, pagina, resumen? }
```

El `resumen` solo viaja al administrador (RF-6). La búsqueda y el listado nunca cargan los 5.000 clientes de una vez.

### E. Cuenta del cliente (RF-7, RF-25, RF-27)

```text
FUNCIÓN cuenta(usuario, clienteId):
  cliente = buscarPorId(clienteId); SI NO: 404
  [saldo, compras, movimientos] = en paralelo
    compras      = ventas completadas y anuladas del cliente (el detalle de cada una se abre aparte)
    movimientos  = fiado del cliente con el nombre de quien lo registró (aunque esa cuenta esté desactivada),
                   y en cada abono la marca "anulado" con su motivo
  SI usuario.rol = 'administrador': cambios_rut = historial de cambios de RUT del cliente
  RESPONDER { cliente, compras, movimientos, cambios_rut? }

FUNCIÓN detalleCompra(usuario, clienteId, ventaId):
  venta = ventasModelo.obtenerDetalle(ventaId)          // ya existe; no trae costos ni márgenes
  SI NO venta O venta.cliente_id <> clienteId O venta.estado NO ES 'completada' NI 'anulada': 404
  RESPONDER venta                                        // la ruta no permite ver ventas de otras personas
```

---

## 4. Cómo se pinta en la interfaz

### `/clientes` (cajero y administrador) (RF-1 a RF-6)

- Cabecera con el buscador (foco automático; se escribe RUT con o sin puntos, completo o parcial, o nombre) y fichas de estado: **Todos · En deuda · A favor · Al día**. Con "En deuda" se ordena de la mayor a la menor deuda.
- Tabla de 25 clientes: nombre (o "Sin nombre") y RUT formateado, teléfono y saldo con el estado. Los deudores se destacan con color y monto, en una etiqueta legible a distancia de mesón. Clic abre la cuenta.
- Solo el administrador ve, sobre la tabla, **"N clientes en deuda · Por cobrar $X"** (RF-6).
- Sin resultados: "No hay clientes con ese dato". Si lo escrito es un RUT válido, aparece **Registrar cliente** (solo con RUT, nombre opcional).

### `/clientes/:id` y la cuenta (RF-5, RF-7 a RF-9, RF-10 a RF-25)

- Arriba: nombre y RUT, contacto y el **saldo grande** con su estado (Debe, Al día, A favor).
- Botón principal **Registrar abono**. A su lado, **Editar datos** y **Corregir RUT**.
- **Abono:** monto (con teclado numérico), método (Efectivo · Débito · Crédito · Transferencia) y observación opcional. Mientras se escribe se ve "Saldo actual $X → quedará $Y". Si el monto supera la deuda, un aviso dice cuánto quedará a favor y exige marcar la confirmación. Al registrar, se ve el resumen (monto, método y saldo resultante) y la cuenta se actualiza; el botón se deshabilita mientras la solicitud está en vuelo.
- **Compras** (completadas y anuladas) y **movimientos de fiado**, de lo más reciente a lo más antiguo. Cada abono muestra el método y, si se anuló, la marca "Anulado" con su motivo. Para el administrador, un abono vigente tiene **Anular** (pide motivo). El cajero no ve ese botón.
- El administrador, además, ve el **historial de cambios de RUT** (anterior, nuevo, quién y cuándo). El cajero no.
- Cada compra abre su detalle (productos, cantidades, precios y subtotales) para ambos roles, reutilizando el modal del historial. El botón **Anular venta** solo aparece para el administrador y solo cuando el modal se abrió desde el historial; desde la cuenta no se ofrece.

### Desde la venta (RF-8)

- En la pantalla de cobro, la tarjeta del cliente suma **Ver cuenta**: abre la cuenta sobre la venta, sin salir de ella. El carrito, el método elegido y todo lo escrito siguen en su lugar. Al cerrar, el saldo de la tarjeta se refresca.

---

## 5. Decisiones técnicas justificadas

| Decisión | Por qué | Alternativa descartada | RF |
| --- | --- | --- | --- |
| La anulación de abono es un movimiento nuevo (`anulacion_abono`) que referencia al abono | Los movimientos solo se insertan; el abono queda visible y el saldo sigue siendo la suma de movimientos | Marcar el abono como anulado o borrarlo: cambia datos ya registrados y rompe la conciliación | RF-15, 16, 26 |
| `UNIQUE (abono_anulado_id)` y `CHECK (monto > 0)` | La base impide la doble anulación y los montos inválidos aunque falle una validación | Confiar solo en el código | RF-17; RNF-3 |
| Saldo siempre derivado de los movimientos (vista y suma en la transacción) | No hay un saldo guardado que pueda descuadrarse; la advertencia de saldo a favor usa el saldo real | Columna `saldo` en `clientes` | RF-26 |
| Bloqueo `FOR UPDATE` de la fila del cliente en abonos, anulaciones y cambio de RUT | Serializa operaciones del mismo cliente; el orden es siempre cliente y luego movimiento, así que no hay interbloqueos | Sin bloqueo: dos abonos simultáneos verían el mismo saldo | RF-12, 13; RNF-3 |
| La confirmación del saldo a favor y del cambio de RUT se exigen en el servidor (`409` con el aviso) | Una llamada directa a la API no se salta la confirmación | Confirmar solo en la pantalla | RF-12, 23 |
| El RUT se cambia en la columna de `clientes`; compras y fiados cuelgan de `cliente_id` | Nada se copia ni se pierde y el historial queda intacto | Reescribir ventas y movimientos con el RUT nuevo | RF-24 |
| `cambios_rut` como tabla propia de solo inserción | Constancia inalterable de quién, cuándo, anterior y nuevo | Dejarlo en un campo de texto de `clientes` | RF-24, 25; RNF-7 |
| Listado con búsqueda, estado, orden y paginación en SQL, con `LIKE` sobre la colación `utf8mb4_unicode_ci` | La colación ya ignora mayúsculas y tildes; 5.000 clientes entran en una consulta simple sin índices nuevos | Buscar en React sobre todos los clientes; un índice de texto completo | RF-2; RNF-2 |
| El RUT se busca sin puntos ni espacios, como se guarda | `12.345` encuentra `12345678-5` | Guardar el RUT con formato | RF-2 |
| El resumen del administrador sale del mismo cálculo de saldo, sin compensar a favor | Una sola regla de saldo; el total por cobrar es solo de quienes deben | Sumar todos los saldos | RF-6 |
| El detalle de compra del cajero va por una ruta de la cuenta que valida que la venta sea de ese cliente | Abrir `GET /api/ventas/:id` al cajero le daría acceso a cualquier venta del negocio, y el historial general debe seguir cerrado | Abrir `GET /api/ventas/:id` a ambos roles | RF-9 |
| Un solo `armarCliente` para ambos roles (con contacto) | La cuenta ya no es reservada; evita dos formatos y bugs de roles | Mantener una versión reducida para el cajero | RF-7 |
| `cuenta` y datos para ambos roles; anular abono con `requiereRol('administrador')` | La regla está en la ruta y se prueba con la llamada directa | Ocultar el botón solo en la pantalla | RF-19 |
| Las rutas nuevas **no** entran en la lista blanca del cajero desactivado | Solo puede terminar o cancelar su venta | Ampliar la lista blanca | caso límite |
| Cuenta como componente reutilizable (ruta y modal de la venta) | RF-8 sin duplicar pantalla | Navegar fuera de la venta y volver | RF-8 |
| Sin librerías nuevas; `node --test` y verificación manual de la interfaz | Principio 1 | Vitest o Testing Library | todos |

---

## 6. Estrategia de pruebas

### 6.1 Pruebas unitarias (`npm test`)

| Prueba | Función | RF |
| --- | --- | --- |
| Monto entero positivo; rechaza 0, negativos, decimales, texto y más de $99.999.999 | `validarMontoAbono` | RF-10 |
| Métodos válidos e inválidos | `validarMetodoAbono` | RF-10 |
| Abono menor, igual y mayor que la deuda; cliente al día o con saldo a favor | `evaluarAbono` | RF-11, 12 |
| Cargo y anulación de abono suman; abono y anulación de venta restan; cualquier combinación cuadra | `calcularSaldo` | RF-26 |
| Solo `abono` y no anulado se puede anular | `puedeAnularAbono` | RF-16, 17 |
| Observación opcional y con tope | `normalizarObservacion` | RF-10 |
| Nombre, teléfono, correo y dirección: formatos, topes, vacío que borra, solo lo enviado | `validarDatosCliente` | RF-20 |
| RUT con y sin puntos y guion, parcial, nombre con tilde; texto que no puede ser RUT | `interpretarBusqueda` | RF-2 |
| Estados, orden y página válidos e inválidos; orden por defecto con "en deuda" | `validarFiltroListado` | RF-3, 4 |
| La lista blanca del cajero desactivado no incluye cuenta, abonos, edición ni RUT | `esRutaDeVentaEnCurso` | caso límite |

### 6.2 Pruebas de integración (`npm run test:integracion`, MySQL real, base `almacenpro_test_clientes`)

| Escenario | RF |
| --- | --- |
| Listado: búsqueda por RUT con puntos, sin puntos y parcial, y por nombre con otra tilde y otro uso de mayúsculas; filtro por estado; orden por nombre y por deuda; paginación | RF-1 a 4 |
| El administrador recibe `resumen` (cantidad en deuda y total por cobrar, sin compensar saldos a favor); el cajero no | RF-6 |
| La cuenta la ven cajero y administrador, con compras, movimientos y contacto; `cambios_rut` solo para el administrador | RF-7, 9, 25 |
| El cajero abre el detalle de una compra completada y de una anulada de ese cliente (sin costos ni márgenes); recibe 404 si la venta es de otro cliente o está cancelada, y sigue recibiendo 403 en el historial y en `GET /api/ventas/:id` | RF-7, 9; RNF-8 |
| Abono: baja el saldo, queda con quién, cuándo y método; monto 0, negativo, decimal o método inválido se rechazan | RF-10, 13 |
| Abono mayor que la deuda: 409 `ABONO_SUPERA_DEUDA` sin cambiar nada; con `confirmar_saldo_a_favor` queda saldo a favor. Igual con cliente al día | RF-12 |
| Si el saldo cambió entre la pantalla y el envío, la advertencia se decide con el saldo real | RF-12 |
| **Reversa total:** si falla la inserción (usuario inexistente), no queda abono ni cambia el saldo | RF-14; RNF-3 |
| **Dos abonos simultáneos** (`Promise.all`) del mismo cliente: ambos se registran y el saldo final cuadra | RF-13; RNF-3 |
| Los abonos no se editan ni se borran (no hay rutas) | RF-15 |
| Anular abono: el administrador exige motivo; el saldo vuelve a subir; sigue visible marcado como anulado; segundo intento 409; sin plazo; el cajero recibe 403 | RF-16 a 19 |
| **Dos anulaciones simultáneas** del mismo abono: una se aplica y la otra recibe 409 | RF-17; RNF-3 |
| Editar datos: guarda, vacío borra, formatos inválidos 400; el cajero también puede | RF-20 |
| Cambiar RUT: inválido 400; repetido 409 con quién es y sin fusionar; sin confirmar 409 sin cambios; confirmado conserva compras, fiados y saldo y deja `cambios_rut` | RF-21 a 24 |
| Cambiar RUT mientras el cliente tiene una venta en curso: la venta sigue asociada | caso límite |
| **Conciliación:** tras una mezcla de ventas fiadas, abonos, anulación de venta y anulación de abono, el saldo de cada cliente es la suma con signo de sus movimientos | RF-26; RNF-3 |
| Los movimientos conservan al usuario que los registró aunque su cuenta se desactive | RF-27 |
| Un cajero desactivado con venta en curso recibe 403 en cuenta, abonos y edición, pero termina su venta | caso límite |
| Mensajes principales en español, montos sin decimales | RNF-4, 5 |
| Costo y margen no viajan en ninguna respuesta del cajero | RNF-8 |
| Migración: base con datos de la spec 003 conserva cargos, abonos y anulaciones y su saldo; se detiene con montos no positivos | migración |

Las pruebas de la spec 003 se ajustan: la que esperaba 403 del cajero en la cuenta y en el listado, y la de anulación con abonos, que usa la ruta real.

### 6.3 Verificación manual y de rendimiento (entorno de prueba aparte)

| Verificación | RF |
| --- | --- |
| Registrar un abono en menos de 20 s desde que se tiene el RUT, con teclado y también táctil (reloj en mano) | RNF-1, 6 |
| Cajero: buscar a un deudor, ver su cuenta, abrir el detalle de sus compras, abonar y ver el saldo; confirmar que no ve el botón de anular, el total por cobrar ni los cambios de RUT, ni por URL directa | RF-6, 9, 19, 25 |
| Administrador: anular un abono con motivo y ver el saldo volver a subir | RF-16 a 18 |
| Abono mayor que la deuda: aviso y confirmación; saldo a favor se descuenta en la próxima venta fiada | RF-12 |
| Doble clic en Registrar abono: un solo abono | caso límite |
| Cambiar un RUT: aviso, confirmación, constancia visible para el administrador; RUT ya existente rechazado | RF-21 a 25 |
| Desde la venta: abrir la cuenta del cliente, abonar, volver; el carrito sigue intacto y el saldo se actualiza | RF-8 |
| Buscar sin resultados con un RUT válido y registrar al cliente | caso límite |
| Montos `$15.000`, RUT `12.345.678-5`, todo en español | RNF-4, 5 |
| `tsc --noEmit` y `vite build` sin errores | RNF-6 |
| Con 5.000 clientes, 50.000 ventas y 20.000 movimientos: buscar, abrir una cuenta, registrar un abono y listar deudores en menos de 2 s | RNF-2 |

---

## Secuencia de implementación

1. Documentos: specs 001 y 003 y principio 5 de la constitución; se agregan los tres archivos de la spec 004.
2. Funciones puras de `utils/clientes.js` y sus pruebas unitarias.
3. Migración 005 y `schema.sql`.
4. Modelos: fiado (abono y anulación), cambios de RUT y clientes (listado, datos, RUT, cuenta).
5. Controladores y rutas del backend; ajuste de las pruebas de la spec 003.
6. Tipos y listado de clientes en la interfaz.
7. Cuenta del cliente: abonos, anulación, datos y cambio de RUT.
8. Cuenta desde la venta y menú del cajero.
9. Pruebas de integración de la spec 004.
10. Checklist manual, rendimiento, `README.md`, `MEMORY.md` y `AGENTS.md`; marcar la spec como implementada.

(El detalle por tarea, con su "hecho cuando", va en `tasks.md`.)

## Riesgos y cuidados

- **Migración sobre datos reales:** agrega columnas, un tipo y una tabla, y cambia la vista. Exige respaldo y no se ejecuta en `almacenpro` sin tu visto bueno; las pruebas usan su propia base. Antes de la 005 hay que aplicar la 004, que sigue pendiente en esa base.
- **Dos cuentas con el mismo cliente a la vez:** el bloqueo de la fila del cliente y los índices `UNIQUE` son la defensa; se prueban con llamadas simultáneas.
- **Dinero:** `mysql2` devuelve `DECIMAL` como texto; los modelos convierten a número, como en las specs 002 y 003. Todos los montos son pesos enteros.
- **Cambio de forma de `GET /api/clientes`:** hoy responde 501, así que no rompe a nadie.
- **Permisos más amplios para el Cajero:** el riesgo es dejar abierta una ruta de administrador o que el detalle de compra deje ver ventas de otras personas (se prueba con un cliente ajeno). Cada ruta nueva tiene su prueba de rol, y la lista blanca del cajero desactivado no cambia.
- **Modal sobre otro modal:** la cuenta se abre desde el panel de cobro, que ya es un modal. Si el componente `Modal` no admite apilarse (foco y tecla Escape), se ajusta o la cuenta se muestra dentro del mismo panel; se verifica en el checklist manual.
- **Inactividad de la venta:** mientras el cajero está en la cuenta, la venta en curso sigue su cuenta regresiva de inactividad (aviso a los 10 minutos). Registrar un abono desde la venta cuenta como actividad de la venta.
- **No tocar lo del usuario:** las pruebas manuales usan puertos y bases propios; el servidor del usuario (4000 y 5173) y `almacenpro` no se usan.
