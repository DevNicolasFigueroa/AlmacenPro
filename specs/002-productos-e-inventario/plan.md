# Plan 002 - Productos e inventario

## Estado actual y enfoque

El módulo existe a medias: hay listado (`GET /api/productos`, con costo solo para el administrador), alta mínima (`POST /api/productos`) y una vista de inventario de solo lectura. No hay edición, desactivación, ajuste de stock, historial ni resumen de alertas, y el stock se guarda como entero.

Este plan es **incremental** y cubre **toda la spec 002** (RF-1–34, RNF-1–7). Respeta la constitución: capas `routes → controllers → models`, sin SQL fuera de los modelos, escrituras de stock en UNA transacción, 100% en español, montos CLP sin decimales y **sin librerías nuevas**.

### Brechas detectadas

| Brecha                     | Estado actual                                                                 | RF                        |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| Stock en kilos             | `stock` y `stock_minimo` son `INT`; `unidad_medida` es texto libre            | RF-7, RF-8                |
| Historial de movimientos   | No existe ninguna tabla                                                       | RF-8, RF-26, RF-28, RF-29 |
| Stock nunca negativo       | Sin restricción en la base ni en el alta (`stock` se acepta tal cual)         | RNF-1, RF-25              |
| Validaciones del alta      | Solo nombre y precio > 0; acepta costo negativo, decimales y cualquier unidad | RF-2, RF-3, RF-7          |
| Código de barras repetido  | Error genérico "El valor ingresado ya está registrado"                        | RF-5                      |
| Editar y desactivar        | No hay rutas ni modelo                                                        | RF-9, RF-13, RF-14        |
| Stock directo en la ficha  | El alta guarda `stock` sin dejar movimiento                                   | RF-8, RF-10               |
| Productos desactivados     | `listar` los oculta para todos                                                | RF-17, RF-19              |
| Definición de "stock bajo" | `stock <= stock_minimo` también marca productos con mínimo 0                  | RF-31                     |
| Agotado y "No disponible"  | No existen                                                                    | RF-19, RF-31              |
| Resumen de alertas         | No existe                                                                     | RF-33                     |
| Categorías                 | No hay forma de listarlas para el formulario                                  | RF-1, RF-16, RF-18        |
| Filtros                    | Solo `buscar` y `stockBajo=1`; faltan categoría y estado de stock             | RF-18                     |
| Interfaz                   | Solo lectura, barra de stock con la regla antigua, formato de kilos sin coma  | RF-17, RNF-4              |

### Fuera de alcance de este plan

- Descontar stock al vender y devolverlo al anular (spec de ventas). Este plan deja listos la tabla de movimientos y el contrato de bloqueo para que esa spec los use (ver la decisión sobre el contrato para la spec de ventas, en la sección 5).
- Categorías (crear, editar, eliminar), proveedores, lotes, otras unidades, importación, etiquetas, reportes (lista completa en la spec).

### Interpretaciones de la spec que conviene confirmar

- **Categoría:** RF-1 la exige y RF-16 contempla "Sin categoría". Se resuelve así: obligatoria al crear y al guardar una edición; "Sin categoría" solo se muestra para productos que ya existían sin ella.
- **Corrección igual al stock actual:** se acepta y se registra con diferencia 0 (sirve como constancia de un conteo). La spec no lo prohíbe.
- **Retirar de la venta (RF-13):** hoy el punto de venta no lista productos. El modelo expone la consulta de productos vendibles (solo activos); quien la use será la spec de ventas.

---

## 1. Archivos que se crean o modifican

### Backend

| Archivo                                           | Tipo                  | Responsabilidad                                                                                                                                                                                                                                                                                                                                                               | RF                                       |
| ------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `backend/database/migration_003_spec002.sql`      | Crear                 | Para bases existentes: `stock` y `stock_minimo` a `DECIMAL(10,3)`; `unidad_medida` a `ENUM('unidad','kilo')` normalizando valores previos; restricción `CHECK (stock >= 0)`; tabla `movimientos_stock`; copia de "stock inicial" para productos que ya tenían stock. Se ejecuta una sola vez.                                                                                 | RF-7, 8, 26, 29; RNF-1, 7                |
| `backend/database/schema.sql`                     | Modificar             | Mismos cambios para bases nuevas (las pruebas de integración cargan este archivo).                                                                                                                                                                                                                                                                                            | RF-7, 8, 26; RNF-1                       |
| `backend/src/utils/inventario.js`                 | Crear                 | Funciones puras de validación, normalización, cálculo de ajuste y estado de stock (sección 2).                                                                                                                                                                                                                                                                                | RF-2–5, 7, 12, 22–26, 31, 34             |
| `backend/src/utils/inventario.test.js`            | Crear                 | Pruebas unitarias de esas funciones (`npm test` ya recoge `src/utils/*.test.js`).                                                                                                                                                                                                                                                                                             | RF con lógica                            |
| `backend/src/models/movimientosStock.model.js`    | Crear                 | SQL de `movimientos_stock`: `insertar(conexion, movimiento)` y `listarPorProducto`. Sin funciones de modificar ni borrar.                                                                                                                                                                                                                                                     | RF-8, 26, 28, 29                         |
| `backend/src/models/productos.model.js`           | Modificar             | SQL de productos: listado con filtros (todos, activos y desactivados), `buscarPorId`, `buscarPorCodigoBarras`, `listarCategorias`, `crear` (producto + movimiento inicial en una transacción), `actualizar`, `cambiarEstado`, `tieneVentasOMovimientos`, `ajustarStock` (transacción con `FOR UPDATE`), consulta de vendibles (solo activos). Proyección del costo según rol. | RF-1, 5, 6, 8–19, 22–27, 30; RNF-1, 2, 6 |
| `backend/src/controllers/productos.controller.js` | Modificar             | Orquesta: valida con las funciones puras, decide mensajes y códigos HTTP, arma el estado de stock de cada fila y el resumen. Lista blanca de campos al editar (sin `stock`).                                                                                                                                                                                                  | RF-1–34                                  |
| `backend/src/routes/productos.routes.js`          | Modificar             | Rutas nuevas (tabla abajo). Las rutas fijas (`/categorias`, `/resumen-stock`) van antes de `/:id`.                                                                                                                                                                                                                                                                            | RF-9, 13–15, 17–21, 28, 33               |
| `backend/src/tests/integracion.test.js`           | Modificar             | Escenarios de endpoints contra MySQL (sección 6.2).                                                                                                                                                                                                                                                                                                                           | RF de la spec                            |
| `README.md`                                       | Modificar (al cierre) | Tabla de endpoints y paso de migración 003.                                                                                                                                                                                                                                                                                                                                   | —                                        |
| `MEMORY.md`                                       | Modificar (al cierre) | Estado y pendientes.                                                                                                                                                                                                                                                                                                                                                          | —                                        |

Sin cambios: `backend/src/app.js` (la ruta `/api/productos` ya está montada), `middlewares/auth.js` (`autenticar` y `requiereRol` bastan), `middlewares/errores.js` (el `ER_DUP_ENTRY` queda como red de seguridad ante dos altas simultáneas), `utils/validaciones.js` (es de autenticación), `models/ventas.model.js`, `config/*`, `database/seed.js`.

**Rutas (todas exigen sesión):**

| Método y ruta                        | Acceso        | Qué hace                                                                                                                                                                          | RF           |
| ------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `GET /api/productos`                 | ambos         | Listado con `buscar`, `categoria` y `estadoStock` (`bajo` o `agotado`); incluye desactivados, activos primero; costo solo al administrador. Reemplaza al parámetro `stockBajo=1`. | RF-17–20     |
| `GET /api/productos/resumen-stock`   | ambos         | `{ stockBajo, agotados }` de productos activos; sin costos.                                                                                                                       | RF-33, 34    |
| `GET /api/productos/categorias`      | ambos         | Categorías existentes para el formulario y el filtro.                                                                                                                             | RF-1, 16, 18 |
| `POST /api/productos`                | administrador | Crea producto (y movimiento "stock inicial").                                                                                                                                     | RF-1–8       |
| `PUT /api/productos/:id`             | administrador | Edita datos (nunca el stock).                                                                                                                                                     | RF-9–12      |
| `PATCH /api/productos/:id/estado`    | administrador | Desactiva o reactiva. No existe `DELETE`.                                                                                                                                         | RF-13–15     |
| `POST /api/productos/:id/ajustes`    | administrador | Ajuste manual de stock.                                                                                                                                                           | RF-22–27, 30 |
| `GET /api/productos/:id/movimientos` | administrador | Historial, del más reciente al más antiguo.                                                                                                                                       | RF-28        |

Un cajero que llama a una ruta de administrador recibe el 403 existente ("No tienes permisos para realizar esta acción") (RF-21; spec 001, RF-14).

**Tabla `movimientos_stock` (solo se inserta, nunca se modifica):**
`id`, `producto_id` (FK, sin borrado en cascada), `usuario_id` (FK), `tipo` (`stock_inicial`, `merma`, `reposicion`, `correccion`, `venta`, `anulacion_venta`), `cantidad` (diferencia con signo: positiva suma, negativa resta), `stock_antes`, `stock_despues`, `nota` (255, opcional), `venta_id` (nulo salvo `venta` y `anulacion_venta`), `creado_en`; índice `(producto_id, creado_en)`. Los tipos `venta` y `anulacion_venta` quedan previstos para la spec de ventas (RF-28).

### Frontend

| Archivo                                           | Tipo      | Responsabilidad                                                                                                                                                             | RF               |
| ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `frontend/src/types/index.ts`                     | Modificar | `Producto` con `stock` y `stock_minimo` numéricos, `unidad_medida: 'unidad' \| 'kilo'`, `estado_stock`; tipos `Categoria`, `ResumenStock`, `MovimientoStock`, `TipoAjuste`. | RF-7, 17, 28, 31 |
| `frontend/src/utils/formato.ts`                   | Crear     | `formatearClp`, `formatearCantidad(valor, unidad)` ("2,5 kg", "12 u."), `parsearCantidad(texto, unidad)` (acepta coma). Reemplaza el formateo local de `InventarioView`.    | RNF-4, RF-7      |
| `frontend/src/views/InventarioView.tsx`           | Modificar | Listado con filtros, etiquetas de estado y acciones por fila según rol.                                                                                                     | RF-17–21, 31     |
| `frontend/src/components/FormularioProducto.tsx`  | Crear     | Alta y edición en un panel modal; advertencia de venta con pérdida; aviso de nombre repetido.                                                                               | RF-1–9, 12       |
| `frontend/src/components/AjusteStockModal.tsx`    | Crear     | Motivo, cantidad y nota; muestra stock actual y resultado esperado.                                                                                                         | RF-22–25, 30     |
| `frontend/src/components/HistorialStockModal.tsx` | Crear     | Tabla de movimientos del producto.                                                                                                                                          | RF-28, 29        |
| `frontend/src/components/ResumenStock.tsx`        | Crear     | Franja con cantidad de productos con stock bajo y agotados; enlaza al listado filtrado.                                                                                     | RF-33            |
| `frontend/src/App.tsx`                            | Modificar | Muestra `ResumenStock` al ingresar (pantalla `/ventas`).                                                                                                                    | RF-33            |
| `frontend/src/styles/app.css`                     | Modificar | Variante de etiqueta para "stock bajo" y estilos del formulario en dos columnas. Reutiliza `velo`/`sobre` (modal de `UsuariosView`), `chip`, `boton`, `campo`, `alerta`.    | RNF-5            |

Sin cambios: `services/api.ts` (el 401 y los mensajes ya funcionan), `RutaProtegida.tsx`, `PuntoVentaView.tsx`, `ClientesView.tsx`, `HistorialVentasView.tsx`. `package.json` no cambia (sin dependencias nuevas).

---

## 2. Funciones puras de lógica

Viven en `backend/src/utils/inventario.js`. Ninguna lee reloj, base de datos ni red. **Solo `armarMovimiento` depende del tiempo y recibe `hoy` como parámetro explícito**; el resto no necesita fecha (el estado de stock se calcula en cada lectura, no se guarda).

| Función                    | Firma                                                                                                                        | Qué decide                                                                                                                                                  | RF              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `esUnidadValida`           | `(unidad) => boolean`                                                                                                        | Solo `unidad` o `kilo`.                                                                                                                                     | RF-1, 7         |
| `normalizarNombre`         | `(valor) => string`                                                                                                          | Recorta y colapsa espacios internos.                                                                                                                        | RF-2            |
| `esNombreValido`           | `(valor) => boolean`                                                                                                         | No vacío, hasta 150 caracteres.                                                                                                                             | RF-2            |
| `esPrecioVentaValido`      | `(valor) => boolean`                                                                                                         | Entero CLP mayor que 0 (tope por la columna).                                                                                                               | RF-3            |
| `esCostoValido`            | `(valor) => boolean`                                                                                                         | Entero CLP igual o mayor que 0.                                                                                                                             | RF-3            |
| `hayVentaConPerdida`       | `(precioVenta, costo) => boolean`                                                                                            | Precio de venta menor que el costo.                                                                                                                         | RF-4            |
| `normalizarCodigoBarras`   | `(valor) => string \| null`                                                                                                  | Recorta; vacío pasa a `null`.                                                                                                                               | RF-5, 6         |
| `esCodigoBarrasValido`     | `(codigo) => boolean`                                                                                                        | `null` es válido; si existe, 1 a 20 caracteres alfanuméricos.                                                                                               | RF-5, 6         |
| `cantidadValidaParaUnidad` | `(cantidad, unidad) => boolean`                                                                                              | Número no negativo; entero si es `unidad`, hasta 3 decimales si es `kilo`.                                                                                  | RF-7, 24        |
| `redondearCantidad`        | `(valor) => number`                                                                                                          | Fija 3 decimales para evitar errores de coma flotante al sumar kilos.                                                                                       | RNF-1           |
| `puedeCambiarUnidad`       | `(unidadActual, unidadNueva, tieneVentasOMovimientos) => boolean`                                                            | Bloquea el cambio si ya hay historia.                                                                                                                       | RF-12           |
| `validarDatosProducto`     | `(datos) => { valores } \| { error }`                                                                                        | Orquesta las anteriores y devuelve los valores normalizados o el primer error en español. Incluye stock mínimo y stock inicial.                             | RF-1–3, 7, 8, 9 |
| `calcularAjuste`           | `({ tipo, cantidad, stockActual, unidad }) => { ok, stockNuevo, diferencia } \| { ok: false, codigo, mensaje, stockActual }` | Merma resta, reposición suma, corrección fija. Rechaza cantidad 0 o negativa (salvo corrección a 0), cantidad que no cumple la unidad y resultado negativo. | RF-22–25; RNF-1 |
| `armarMovimiento`          | `({ productoId, usuarioId, tipo, stockAntes, stockDespues, nota, ventaId, hoy }) => fila`                                    | Construye el movimiento con diferencia con signo, nota normalizada y `creadoEn = hoy`.                                                                      | RF-8, 26        |
| `estadoStock`              | `({ stock, stockMinimo, activo }) => 'agotado' \| 'bajo' \| 'normal' \| 'sin_alerta'`                                        | `sin_alerta` si está desactivado; `agotado` si stock es 0; `bajo` si el mínimo es mayor que 0 y el stock es menor o igual a él; si no, `normal`.            | RF-31, 32, 34   |
| `resumirAlertas`           | `(productos) => { stockBajo, agotados }`                                                                                     | Cuenta usando `estadoStock`.                                                                                                                                | RF-33, 34       |
| `ordenarProductos`         | `(productos) => productos`                                                                                                   | Activos primero y luego por nombre (orden es-CL).                                                                                                           | RF-17           |

En el frontend, `parsearCantidad` (en `utils/formato.ts`) solo convierte texto con coma a número y avisa si no cumple la unidad; **la validación que manda es la del backend** (spec 001, RF-15: la interfaz no es la autoridad).

---

## 3. Algoritmo en pseudocódigo

### A. Crear producto (RF-1–8)

```text
FUNCIÓN crearProducto(admin, cuerpo, hoy):
  resultado = validarDatosProducto(cuerpo)          // nombre, precios, unidad, código,
  SI resultado.error:                                // mínimo, stock inicial, categoría
    RESPONDER 400 resultado.error                    // RF-2, RF-3, RF-7
  datos = resultado.valores

  SI NO existeCategoria(datos.categoriaId):
    RESPONDER 400 "Elige una categoría de la lista"  // RF-1, RF-16

  SI hayVentaConPerdida(datos.precioVenta, datos.costo) Y NO cuerpo.confirmarPerdida:
    RESPONDER 409 { codigo: 'VENTA_CON_PERDIDA',
                    mensaje: "Venderás con pérdida. Confirma para guardar" }   // RF-4

  SI datos.codigoBarras NO ES NULO:
    otro = buscarPorCodigoBarras(datos.codigoBarras)           // activos y desactivados
    SI otro:
      RESPONDER 409 "Ese código ya lo usa «" + otro.nombre + "»"  // RF-5

  TRANSACCIÓN:
    id = insertarProducto(datos, stock = datos.stockInicial)
    SI datos.stockInicial > 0:
      insertarMovimiento(armarMovimiento(tipo = 'stock_inicial', stockAntes = 0,
                         stockDespues = datos.stockInicial, usuario = admin, hoy))  // RF-8
  COMMIT

  avisos = []
  SI existeOtroConMismoNombre(datos.nombre): avisos.agregar("Ya existe un producto con ese nombre")
  RESPONDER 201 { id, avisos }                       // RF-6 (código nulo permitido)
```

### B. Editar producto (RF-9–12)

```text
FUNCIÓN editarProducto(admin, id, cuerpo):
  producto = buscarPorId(id)
  SI NO producto: RESPONDER 404 "No se encontró el producto"

  // Lista blanca: nombre, código, categoría, precio de venta, costo, mínimo, unidad.
  // "stock" y "activo" del cuerpo se IGNORAN                                   // RF-10
  resultado = validarDatosProducto(cuerpo, modo = 'edicion')
  SI resultado.error: RESPONDER 400 resultado.error                             // RF-9

  SI resultado.valores.unidad != producto.unidad_medida:
    SI NO puedeCambiarUnidad(producto.unidad_medida, resultado.valores.unidad,
                             tieneVentasOMovimientos(id)):
      RESPONDER 409 "La unidad no se puede cambiar: el producto ya tiene movimientos"  // RF-12

  SI hayVentaConPerdida(...) Y NO cuerpo.confirmarPerdida: RESPONDER 409 VENTA_CON_PERDIDA  // RF-4
  SI código cambió Y lo tiene OTRO producto: RESPONDER 409 con el nombre                   // RF-5

  actualizarProducto(id, valores)      // el precio nuevo solo rige hacia adelante: el
  RESPONDER 200 { avisos }             // detalle de venta congela el suyo               // RF-11
```

### C. Desactivar y reactivar (RF-13–15)

```text
FUNCIÓN cambiarEstado(admin, id, activo):
  SI NO existe(id): RESPONDER 404
  actualizarActivo(id, activo)         // con cualquier stock; no toca stock ni historial
  RESPONDER 200 (activo ? "Producto reactivado" : "Producto desactivado")   // RF-13, RF-14
  // No existe ruta de borrado.                                              // RF-15
```

### D. Ajuste manual de stock (RF-22–27, RF-30)

```text
FUNCIÓN ajustarStock(admin, id, { tipo, cantidad, nota }, hoy):
  SI tipo NO ESTÁ EN ['merma', 'reposicion', 'correccion']:
    RESPONDER 400 "Elige el motivo: merma, reposición o corrección"   // RF-22

  TRANSACCIÓN:
    producto = SELECT ... FROM productos WHERE id = id FOR UPDATE      // RF-27, RNF-1
    SI NO producto: ROLLBACK; RESPONDER 404

    // No se exige que esté activo: se puede dar de baja la mercadería remanente   // RF-30
    calculo = calcularAjuste({ tipo, cantidad, stockActual: producto.stock,
                               unidad: producto.unidad_medida })
    SI NO calculo.ok:
      ROLLBACK
      RESPONDER 400/409 calculo.mensaje + stock actual        // RF-24, RF-25 (nada se modifica)

    UPDATE productos SET stock = calculo.stockNuevo WHERE id = id
    insertarMovimiento(armarMovimiento({ tipo, stockAntes: producto.stock,
                       stockDespues: calculo.stockNuevo, nota, usuario: admin, hoy }))  // RF-26
  COMMIT                                                   // ambos o ninguno (RNF-2)
  RESPONDER 200 { stock: calculo.stockNuevo, estadoStock: estadoStock(...) }   // RF-32
```

### E. Listado, estado de stock y resumen (RF-17–20, RF-31–34)

```text
FUNCIÓN listarProductos(usuario, { buscar, categoria, estadoStock }):
  filas = SELECT ... [costo solo si usuario.rol = 'administrador']             // RF-20, RNF-6
          FROM productos LEFT JOIN categorias
          WHERE (nombre LIKE buscar OR codigo_barras = buscar) Y categoría     // RF-18
          // sin filtrar por activo: ambos roles ven desactivados              // RF-19
  PARA CADA fila: fila.estado_stock = estadoStock(fila)       // RF-31; recalcula en cada lectura (RF-32)
  SI estadoStock filtro: filas = filas CON estado_stock = filtro               // RF-18
  RESPONDER ordenarProductos(filas)                                            // RF-17

FUNCIÓN resumenStock():
  productos = SELECT id, stock, stock_minimo, activo FROM productos WHERE activo = 1
  RESPONDER resumirAlertas(productos)         // sin costos, ambos roles          // RF-33, RF-34
```

---

## 4. Cómo se pinta en la interfaz

### `/inventario` (RF-17–21, RF-31)

- **Barra de filtros (ambos roles):** búsqueda por nombre o código, selector de categoría y selector de estado de stock (Todos, Stock bajo, Agotados). Leen y escriben los parámetros de la dirección (`?estado=bajo`) para que el resumen pueda enlazar aquí (RF-18, RF-33).
- **Tabla, cajero:** Producto, Categoría, Precio de venta, Unidad, Stock y etiqueta de estado. Sin costo ni margen, sin botones de edición (RF-17, RF-20, RF-21).
- **Tabla, administrador:** además Costo y Margen (calculado en pantalla a partir de los dos precios que ya recibe) y una columna de acciones: **Editar**, **Ajustar stock**, **Historial**, **Desactivar / Reactivar**. Botón superior **Nuevo producto** (RF-1, 9, 13, 14, 22, 28).
- **Etiquetas:** `Agotado` (rojo, `chip--peligro`), `Stock bajo` (ámbar, variante nueva) y `No disponible` (gris, `chip--apagado`) para productos desactivados, con la fila atenuada. Los activos van primero (RF-17, RF-19, RF-31, RF-34). El estado llega calculado del backend (`estado_stock`); la pantalla solo lo pinta. Se retira la barra de progreso antigua, que usaba la regla vieja.
- **Cantidades y montos:** `$1.490`; kilos con coma (`2,5 kg`); unidades enteras (RNF-4).
- **Estado vacío y errores:** igual que hoy, con mensajes en español (RNF-5).
- **Acceso directo:** un cajero no tiene rutas distintas de edición o historial (son modales dentro de `/inventario`); si llama a la API de un administrador a mano recibe 403 (RF-21).

### Formulario de producto (modal, solo administrador) (RF-1–9, RF-12)

- Campos: Nombre, Código de barras (opcional), Categoría (obligatoria), Unidad (Unidad / Kilo), Precio de venta, Costo, Stock mínimo y, solo al crear, Stock inicial. En edición el stock aparece como texto de solo lectura con el enlace "Ajustar stock" (RF-10).
- Los campos de cantidad aceptan coma si la unidad es kilo; si es unidad, solo enteros (RF-7).
- La unidad aparece deshabilitada si el producto ya tiene historia, con la explicación "No se puede cambiar: el producto ya tiene movimientos" (RF-12).
- **Venta con pérdida (RF-4):** si el backend responde `VENTA_CON_PERDIDA`, se muestra una alerta amarilla "Venderás con pérdida" y el botón pasa a **Guardar de todos modos**; al pulsarlo se reenvía con `confirmarPerdida`.
- **Nombre repetido:** tras guardar, aviso no bloqueante "Ya existe un producto con ese nombre".
- **Código repetido (RF-5):** error bajo el campo con el nombre del producto que lo tiene.

### Ajuste de stock (modal) (RF-22–25, RF-30)

- Muestra el producto y su stock actual. Selector de motivo con ayuda corta (Merma: resta · Reposición: suma · Corrección: "cuenta real, fija el stock"), cantidad y nota opcional.
- Vista previa en vivo: "Stock actual 10 → quedará en 7". Si dejaría stock negativo se muestra el error y se deshabilita **Confirmar** (el backend igual lo rechaza).
- Disponible también para productos desactivados (RF-30).

### Historial (modal) (RF-28, RF-29)

- Tabla del más reciente al más antiguo: fecha y hora, quién, motivo (Stock inicial, Merma, Reposición, Corrección, Venta, Anulación de venta), cantidad con signo, stock antes → después y nota. Solo lectura: no hay botones de editar ni borrar (RF-29).

### Resumen de alertas (RF-33)

- En `/ventas` (la pantalla a la que se llega al ingresar), una franja sobre el punto de venta: "**3 con stock bajo · 1 agotado**", cada parte enlaza a `/inventario?estado=bajo` o `?estado=agotado`. Si no hay alertas no se muestra. Misma vista para ambos roles; no incluye costos.

---

## 5. Decisiones técnicas justificadas

| Decisión                                                                                                                              | Por qué                                                                                                                             | Alternativa descartada                                                                                                                                            | RF                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `stock` y `stock_minimo` como `DECIMAL(10,3)` y `unidad_medida` como `ENUM('unidad','kilo')`                                          | Permite kilos con 3 decimales con aritmética exacta y limita la unidad a lo que define la spec.                                     | Guardar gramos en un entero: obliga a convertir en todas partes y confunde al dueño. `FLOAT`: errores de redondeo en el stock.                                    | RF-7, RNF-1             |
| Mantener precios `DECIMAL(11,2)` y validar que sean enteros                                                                           | Evita tocar `detalle_ventas` y la futura spec de ventas; el backend entrega y recibe enteros.                                       | Migrar precios a `INT`: más riesgo sin necesidad hoy.                                                                                                             | RF-3, RNF-4             |
| Estado de stock **derivado en cada lectura** con una función pura                                                                     | "Stock bajo" y "agotado" siempre reflejan el stock actual y el mínimo; no hay nada que recalcular ni desincronizar.                 | Columna `estado_stock` o disparadores: pueden quedar desfasados. Regla copiada en SQL y en React: dos fuentes de verdad.                                          | RF-31, 32, 34           |
| Filtro por estado y resumen calculados en el servidor con la misma función                                                            | Una sola regla; con hasta 5.000 productos el listado completo cumple los 2 s.                                                       | `CASE` en SQL duplicado: dos lugares que mantener. Paginar ahora: complica filtros y resumen sin necesidad demostrada.                                            | RF-18, 33; RNF-3        |
| `movimientos_stock` única, solo-inserción, con diferencia con signo, stock antes/después y `venta_id` opcional                        | Una sola historia por producto que la spec de ventas reutiliza (salidas y anulaciones). El modelo no expone modificar ni borrar.    | Tabla solo de ajustes: no cubre ventas ni anulaciones (RF-28). Disparadores que bloqueen `UPDATE/DELETE`: más piezas; la garantía exigida es "desde la interfaz". | RF-8, 26, 28, 29; RNF-7 |
| Ajuste con `SELECT ... FOR UPDATE` dentro de una transacción y `CHECK (stock >= 0)`                                                   | El bloqueo serializa ajustes simultáneos; la restricción es una red de seguridad en la base si algún flujo futuro falla.            | `UPDATE` sin leer antes: pierde el "stock antes" auditable. Bloqueo optimista con versión: reintentos innecesarios en un negocio de un mesón.                     | RF-25–27; RNF-1, 2      |
| Contrato para la spec de ventas: usar `movimientosStock.insertar` y bloquear la fila del producto en la misma transacción de la venta | Hace que RF-27 ("vender y ajustar a la vez") se cumpla cuando ventas se implemente. Este plan **solo prueba ajuste contra ajuste**. | Descontar stock desde ahora: pertenece a otra spec.                                                                                                               | RF-27                   |
| Edición con **lista blanca** de campos; `stock` y `activo` del cuerpo se ignoran                                                      | El stock solo cambia por ajuste, venta o anulación.                                                                                 | Aceptar el cuerpo completo: permitiría saltarse el historial.                                                                                                     | RF-10                   |
| Confirmación de venta con pérdida validada en el backend (`confirmarPerdida`)                                                         | La regla no depende de la interfaz; cualquier cliente de la API debe confirmar.                                                     | Confirmar solo en React: se evita llamando a la API.                                                                                                              | RF-4                    |
| Código de barras: verificación previa para dar el mensaje con el nombre, más el índice `UNIQUE` existente                             | Cumple RF-5 y el índice cubre la carrera entre dos altas simultáneas (cae en el 409 genérico).                                      | Depender solo del error de MySQL: no puede nombrar al producto.                                                                                                   | RF-5                    |
| `PATCH .../estado` para desactivar y reactivar; sin `DELETE`                                                                          | Reproduce el patrón de cuentas (`/usuarios/:id/estado`) y la spec prohíbe eliminar.                                                 | `DELETE` lógico: sugiere borrado.                                                                                                                                 | RF-13–15                |
| Productos desactivados incluidos en el listado de ambos roles, con consulta aparte de "vendibles" (solo activos)                      | RF-19 los muestra a todos; la venta futura solo necesita los activos.                                                               | Listados distintos por rol: más rutas sin ganar nada.                                                                                                             | RF-13, 19               |
| Corrección con el mismo valor del stock se registra con diferencia 0                                                                  | Deja constancia de que se contó; no daña el historial.                                                                              | Rechazarla: la spec no lo pide y complica el flujo.                                                                                                               | RF-23, 26               |
| Costo proyectado por rol en el modelo (ya existente) y resumen sin campos de costo                                                    | El costo no viaja al cajero por ninguna ruta.                                                                                       | Ocultarlo solo en la interfaz.                                                                                                                                    | RF-20; RNF-6            |
| Modales con las clases `velo`/`sobre` ya existentes y sin librerías nuevas                                                            | Principio 1 de la constitución.                                                                                                     | Librería de componentes o de formularios.                                                                                                                         | RNF-5                   |
| `node --test` para unitarias e integración; verificación manual de interfaz; sin framework de pruebas de frontend                     | Igual que la spec 001: sin dependencias nuevas.                                                                                     | Vitest con Testing Library: fuera del stack actual.                                                                                                               | todos                   |

---

## 6. Estrategia de pruebas

### 6.1 Pruebas unitarias (`npm test`, `node --test`)

| Prueba                                                                                                                                    | Función                                          | RF              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------- |
| Solo `unidad` y `kilo`                                                                                                                    | `esUnidadValida`                                 | RF-1, 7         |
| Nombre vacío o solo espacios se rechaza; se colapsan espacios                                                                             | `normalizarNombre`, `esNombreValido`             | RF-2            |
| Precio de venta > 0 y entero; costo ≥ 0 y entero; rechaza decimales y textos                                                              | `esPrecioVentaValido`, `esCostoValido`           | RF-3            |
| Venta con pérdida solo si venta < costo (igual no cuenta)                                                                                 | `hayVentaConPerdida`                             | RF-4            |
| Código vacío pasa a `null`; largo y caracteres válidos                                                                                    | `normalizarCodigoBarras`, `esCodigoBarrasValido` | RF-5, 6         |
| Unidades solo enteras; kilos con hasta 3 decimales; negativos y NaN fuera                                                                 | `cantidadValidaParaUnidad`                       | RF-7, 24        |
| `0.1 + 0.2` en kilos da `0.3`                                                                                                             | `redondearCantidad`                              | RNF-1           |
| Cambio de unidad bloqueado con historia                                                                                                   | `puedeCambiarUnidad`                             | RF-12           |
| Datos completos devuelven valores normalizados; cada campo inválido da su error en español; stock inicial y mínimo con decimales en kilos | `validarDatosProducto`                           | RF-1–3, 7, 8, 9 |
| Merma resta, reposición suma, corrección fija                                                                                             | `calcularAjuste`                                 | RF-23           |
| Cantidad 0 o negativa se rechaza; corrección a 0 es válida                                                                                | `calcularAjuste`                                 | RF-24           |
| Merma mayor al stock se rechaza e informa el stock actual                                                                                 | `calcularAjuste`                                 | RF-25           |
| Decimales en producto por unidad se rechazan; kilos con 2,5 pasan                                                                         | `calcularAjuste`                                 | RF-7, 24        |
| Corrección igual al stock deja diferencia 0                                                                                               | `calcularAjuste`                                 | RF-23           |
| El movimiento lleva diferencia con signo, stock antes y después, nota recortada y `creadoEn = hoy`                                        | `armarMovimiento`                                | RF-8, 26        |
| Agotado con stock 0 aunque el mínimo sea 0; bajo con mínimo > 0 y stock ≤ mínimo; mínimo 0 no genera "bajo"; desactivado es `sin_alerta`  | `estadoStock`                                    | RF-31, 34       |
| El resumen cuenta solo activos                                                                                                            | `resumirAlertas`                                 | RF-33, 34       |
| Activos primero y luego por nombre                                                                                                        | `ordenarProductos`                               | RF-17           |

### 6.2 Pruebas de integración (`npm run test:integracion`, MySQL real)

| Escenario                                                                                                                                       | RF                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Crear un producto por unidad y otro por kilo, con y sin código; ambos aparecen en el listado                                                    | RF-1, 6, 7, 17       |
| Datos inválidos (nombre vacío, precio 0, costo negativo, decimales en CLP) dan 400 en español                                                   | RF-2, 3              |
| Precio menor al costo responde 409 `VENTA_CON_PERDIDA`; con `confirmarPerdida` se guarda                                                        | RF-4                 |
| Código repetido (incluso de un producto desactivado) responde 409 con el nombre del producto                                                    | RF-5                 |
| Stock inicial deja un movimiento "stock inicial"; con stock 0 no deja movimiento                                                                | RF-8                 |
| Editar precio, costo, categoría y mínimo funciona; enviar `stock` en la edición no lo cambia                                                    | RF-9, 10             |
| Cambiar el precio no altera el precio congelado en un `detalle_ventas` existente                                                                | RF-11                |
| Cambiar la unidad de un producto con movimientos responde 409                                                                                   | RF-12                |
| Desactivar con stock lo mantiene en el listado como desactivado, con stock e historial intactos; reactivar lo devuelve                          | RF-13, 14            |
| No existe `DELETE /api/productos/:id` (404)                                                                                                     | RF-15                |
| Un producto sin categoría (dato previo) se lista como "Sin categoría"                                                                           | RF-16                |
| Cajero y administrador reciben el mismo listado; el cajero sin `precio_costo`; el cajero ve desactivados                                        | RF-17, 19, 20; RNF-6 |
| Búsqueda por nombre y por código; filtros por categoría y por estado de stock                                                                   | RF-18                |
| Cajero recibe 403 al crear, editar, cambiar estado, ajustar o ver movimientos                                                                   | RF-21                |
| Merma, reposición y corrección actualizan el stock y dejan movimiento con usuario, nota y antes/después                                         | RF-22, 23, 26        |
| Cantidad inválida, merma mayor al stock y corrección a 0 (válida)                                                                               | RF-24, 25            |
| Ajuste de un producto desactivado funciona                                                                                                      | RF-30                |
| **Dos mermas simultáneas** (`Promise.all`) sobre stock 10, cada una de 6: una se aplica y la otra recibe 409; stock final 4, un solo movimiento | RF-27; RNF-1         |
| La restricción `CHECK` impide un `UPDATE` directo que deje stock negativo                                                                       | RNF-1                |
| Si falla la inserción del movimiento, el stock no cambia (reversa completa)                                                                     | RNF-2                |
| El historial viene del más reciente al más antiguo y no existen rutas para modificarlo                                                          | RF-28, 29; RNF-7     |
| Resumen: cuenta stock bajo y agotados solo de activos, igual para ambos roles                                                                   | RF-33, 34            |
| Al ajustar o cambiar el mínimo, el estado cambia en la siguiente lectura                                                                        | RF-32                |
| Mensajes principales están en español                                                                                                           | RNF-5                |

> Las de integración exigen una instancia de MySQL; el entorno actual no la tiene (`MEMORY.md`). Hasta ejecutarlas, la verificación del flujo transaccional queda pendiente y así se reportará.

### 6.3 Verificación manual de interfaz y de rendimiento

| Verificación                                                                                | RF               |
| ------------------------------------------------------------------------------------------- | ---------------- |
| Crear producto por unidad y por kilo (con coma), con y sin código                           | RF-1, 6, 7       |
| Advertencia de venta con pérdida y botón "Guardar de todos modos"; aviso de nombre repetido | RF-4             |
| Código repetido muestra el nombre del otro producto                                         | RF-5             |
| En edición el stock no es editable; unidad bloqueada si hay historia                        | RF-10, 12        |
| Desactivar y reactivar; el producto desactivado se ve "No disponible" con ambos roles       | RF-13, 14, 19    |
| Ajuste con vista previa; error al dejar stock negativo; historial con el movimiento nuevo   | RF-22–26, 28     |
| Etiquetas Agotado y Stock bajo coherentes con la definición (mínimo 0 no alerta)            | RF-31            |
| Franja de resumen en `/ventas` con enlaces a los filtros; desaparece sin alertas            | RF-33            |
| Cajero: sin costo, margen ni botones de administrador; ve resumen y desactivados            | RF-17, 19–21, 33 |
| Montos `$1.490` y kilos `2,5 kg`; todos los textos en español                               | RNF-4, 5         |
| `tsc --noEmit` y `vite build` sin errores                                                   | RNF-5            |
| Listado y filtros en menos de 2 s con 5.000 productos de prueba                             | RNF-3            |

---

## Secuencia de implementación

1. Funciones puras y sus pruebas unitarias.
2. Migración 003 y `schema.sql` (comprobar antes que no existan productos con stock negativo; la migración copia el stock existente como "stock inicial" atribuido al primer administrador).
3. Modelos: `movimientosStock.model.js` y `productos.model.js`.
4. Controlador y rutas.
5. Tipos, utilidades de formato y componentes del frontend.
6. Vista de inventario, resumen en `/ventas` y estilos.
7. Pruebas de integración y checklist manual.
8. `README.md` y `MEMORY.md` al cierre.

## Riesgos y cuidados

- **Migración sobre datos reales:** convertir `INT` a `DECIMAL` es seguro, pero `CHECK (stock >= 0)` falla si hoy hay stock negativo; revisarlo antes. MySQL aplica `CHECK` desde 8.0.16 (el README ya pide 8+).
- **Unidades previas:** la migración normaliza el texto libre a `unidad` o `kilo`; cualquier valor desconocido pasa a `unidad`. Revisar el resultado.
- **No romper lo existente:** `GET /api/productos` cambia de forma (incluye desactivados, trae `estado_stock` y ya no admite `stockBajo=1`). Hoy solo lo consume `InventarioView`; el POS y los reportes futuros deben usar la consulta de vendibles.
- **Dinero con decimales:** `mysql2` devuelve `DECIMAL` como texto; el modelo convierte stock y precios a número antes de responder.
- **Sin reescribir ventas:** este módulo no toca el ciclo de venta ni la spec 001.
- **MySQL real:** sin instancia no se pueden ejecutar las pruebas de integración; se informará como no verificado.
