# Plan 001 - Autenticación y roles (MVP)

## Estado actual y enfoque

El módulo ya está implementado en gran parte: login con JWT de 8 horas, roles, bloqueo tras cinco intentos, cuentas de cajero con contraseña temporal, recuperación de administrador con código de un solo uso, cierre de sesión bloqueado durante una venta y cancelación automática de ventas abandonadas.

Este plan es **incremental** y cubre el **MVP aprobado**: RF-1–12, RF-14–29, RF-31 y RF-33–39. No reescribe lo que funciona; cierra las brechas entre la spec y el código actual, respetando la constitución: capas `routes → controllers → models`, sin SQL fuera de los modelos, transacciones para operaciones críticas, 100% en español y sin librerías nuevas.

Quedan **diferidos a fase 2**: RF-13 (consulta de fiado del cajero), RF-30 (regenerar código de recuperación), RF-32 (auditoría y cambio de rol) y RNF-9.

### Brechas detectadas

| Brecha | Estado actual | RF |
|---|---|---|
| Costo visible al cajero | `GET /api/productos` devuelve `precio_costo` a todos | RF-11, RF-12 |
| Administradores permanentes | Solo se pueden desactivar o restablecer cajeros | RF-26, RF-27 |
| Guarda del último administrador | No existe | RF-26, RF-27 |
| Contraseña distinta del usuario | Solo se valida el largo mínimo | RF-20, RF-28 |
| Mensaje al denegar permisos | Redirección silenciosa a `/ventas` | RF-14 |
| Desactivación con venta en curso | `token_version` invalida el token y bloquea terminar o cancelar | RF-38 |
| Cancelación manual con cuenta desactivada | No invalida el token en la misma transacción | RF-38, RNF-8 |

### Fuera de alcance del MVP

- Consulta de fiado del cajero (RF-13): pertenece a la spec de fiado/POS.
- Regeneración del código de recuperación (RF-30).
- Auditoría de cuentas y cambio de rol (RF-32, RNF-9).
- Registro transaccional de ventas, stock y fiado (spec del POS).
- Gestión completa de clientes, abonos y límites de crédito (spec de fiado).
- Reportes y edición de productos.
- Recuperación por correo, 2FA, redes sociales y permisos granulares.

---

## 1. Archivos que se crean o modifican

### Backend

| Archivo | Tipo | Responsabilidad | RF |
|---|---|---|---|
| `backend/src/routes/auth.routes.js` | Modificar | Rutas públicas de ingreso y recuperación; rutas protegidas de sesión, cuentas y contraseñas. Sin rutas de rol, auditoría ni regeneración. | RF-1–8, 18–29, 31 |
| `backend/src/controllers/auth.controller.js` | Modificar | Orquesta login, logout, cambio de contraseña, creación de cuentas, activación/desactivación, restablecimiento, recuperación y guarda del último administrador. | RF-1–8, 18–29, 31, 34 |
| `backend/src/models/usuarios.model.js` | Modificar | SQL de usuarios; conteo de administradores activos con bloqueo, cambio de estado, restablecimiento, código de recuperación e invalidación de tokens. | RF-4–7, 18–29, 34 |
| `backend/src/models/productos.model.js` | Modificar | Proyección según rol: incluye `precio_costo` solo al administrador. | RF-11, 12 |
| `backend/src/controllers/productos.controller.js` | Modificar | Pasa el rol a la consulta para decidir si incluye costo. | RF-11, 12 |
| `backend/src/middlewares/auth.js` | Modificar | Verifica sesión, rol, expiración con gracia de venta, cuenta desactivada y contraseña temporal; usa `hoy`. | RF-9, 14–16, 22, 33–38 |
| `backend/src/utils/validaciones.js` | Modificar | Funciones puras de decisión (detalle en la sección 2). | RF-3–6, 18–20, 22, 26–28, 33, 35–38 |
| `backend/src/utils/validaciones.test.js` | Modificar | Pruebas unitarias de las funciones puras. | RF del MVP con lógica |
| `backend/src/services/ventasVencidas.js` | Modificar | Barrido de ventas abandonadas con `hoy` explícito; cierre de sesión en la misma transacción. | RF-38 |
| `backend/src/controllers/ventas.controller.js` | Modificar | Interacción sesión/venta: cierre bloqueado, gracia y desactivación; usa `hoy`. | RF-35, 37, 38 |
| `backend/src/models/ventas.model.js` | Modificar | Fuente de verdad de la venta en curso; cancelación manual o automática invalida la sesión si la cuenta está inactiva. | RF-37, 38 |
| `backend/database/seed.js` | Modificar | Fuerza el cambio de contraseña del administrador inicial. | RF-20; RNF-1 |
| `backend/src/tests/integracion.test.js` | Modificar | Escenarios de endpoints contra MySQL. | RF del MVP |

Sin cambios: `backend/src/app.js`, `backend/src/server.js`, `backend/src/config/env.js`, `backend/src/config/db.js`, `backend/src/middlewares/errores.js`, `backend/src/services/credenciales.js`, `backend/src/controllers/clientes.controller.js`, `backend/src/routes/productos.routes.js`, `backend/src/routes/ventas.routes.js`, `backend/src/routes/clientes.routes.js`, `backend/src/routes/reportes.routes.js`, `backend/database/schema.sql`.

No se crea migración: la tabla `auditoria_cuentas` queda para fase 2.

### Frontend

| Archivo | Tipo | Responsabilidad | RF |
|---|---|---|---|
| `frontend/src/App.tsx` | Modificar | Navegación por rol, nombre y rol visibles, aviso global y rutas. | RF-10, 12, 14, 15, 17 |
| `frontend/src/components/RutaProtegida.tsx` | Modificar | Exige sesión y rol; renderiza `SinPermisos` en vez de redirigir en silencio. | RF-9, 14–16 |
| `frontend/src/components/SinPermisos.tsx` | Crear | Mensaje claro de permisos insuficientes y botón de regreso a ventas. | RF-14 |
| `frontend/src/context/AutenticacionContext.tsx` | Modificar | Sesión global, cierre y sincronización entre pestañas. | RF-34, 36 |
| `frontend/src/services/api.ts` | Modificar | 401 limpia sesión y avisa; 403 no redirige; mensajes en español. | RF-16, 34, 36; RNF-7 |
| `frontend/src/types/index.ts` | Modificar | Tipos de cuentas y costo opcional del producto. | RF-11, 18–27 |
| `frontend/src/views/LoginView.tsx` | Modificar | Ingreso, errores genéricos, bloqueo y aviso de recuperación solo para administradores. | RF-1–3, 31 |
| `frontend/src/views/UsuariosView.tsx` | Modificar | Gestión de cuentas, guarda del último administrador y secretos de un solo uso. Sin rol, auditoría ni regeneración. | RF-18–27 |
| `frontend/src/views/CambiarContrasenaView.tsx` | Modificar | Cambio propio con confirmación y política de contraseña. | RF-28 |
| `frontend/src/views/RecuperarContrasenaView.tsx` | Modificar | Recuperación solo administrador, con política de contraseña. | RF-29, 31 |
| `frontend/src/views/InventarioView.tsx` | Modificar | Columnas según rol: cajero sin costo ni margen; administrador con costo y margen. | RF-10–12 |

Sin cambios: `frontend/src/views/PuntoVentaView.tsx`, `frontend/src/views/ClientesView.tsx`, `frontend/src/views/HistorialVentasView.tsx`, `frontend/src/components/AvisoVentaPorExpirar.tsx`, `frontend/src/main.tsx`.

No se crea `ConsultaFiado.tsx`: la consulta de fiado (RF-13) queda para fase 2.

---

## 2. Funciones puras de lógica

Todas reciben `hoy` como parámetro explícito cuando dependen del tiempo. No leen reloj, base de datos ni red. Se renombra el parámetro `ahora` a `hoy` en las funciones existentes y en sus llamadas.

| Función | Firma | Qué decide | RF |
|---|---|---|---|
| `normalizarIdentificador` | `(valor) => string` | Recorta espacios y rechaza vacío o espacios internos. | RF-18, 19 |
| `esIdentificadorValido` | `(valor) => boolean` | Entre 3 y 50 caracteres; letras, números, punto, guion y guion bajo. | RF-18, 19 |
| `credencialesCompletas` | `(usuario, contrasena) => boolean` | Ambos datos presentes. | RF-3 |
| `esRolValido` | `(rol) => boolean` | Solo `administrador` o `cajero`. | RF-18 |
| `esContrasenaValida` | `(contrasena, usuario) => boolean` | Mínimo 8 caracteres y distinta del identificador. | RF-20, 28 |
| `estadoDeBloqueo` | `(intentos, bloqueadoHasta, hoy) => { bloqueado, minutosRestantes }` | Si el bloqueo de 15 minutos sigue vigente. | RF-4, 5 |
| `siguienteIntento` | `(intentos, exito, hoy) => { intentos, bloqueadoHasta }` | Contador tras un fallo o reinicio tras un éxito. | RF-4, 6 |
| `sesionAceptable` | `(expiraEn, hoy, ventaEnCurso) => 'vigente' \| 'gracia_venta' \| 'expirada'` | Vigencia de la sesión de 8 horas y gracia por venta. | RF-33, 36, 37 |
| `puedeCerrarSesion` | `(ventaEnCurso) => boolean` | Si el cierre manual está permitido. | RF-35 |
| `puedeDesactivar` | `(rolObjetivo, activoObjetivo, adminsActivos) => boolean` | Si se puede desactivar sin dejar cero administradores. | RF-26 |
| `puedeRestablecer` | `(rolObjetivo, activoObjetivo, adminsActivos) => boolean` | Si se puede restablecer la contraseña de un administrador. | RF-27 |
| `debeCambiarContrasena` | `(requiereCambio, ruta) => boolean` | Si la contraseña temporal bloquea la ruta solicitada. | RF-22 |
| `esRutaDeCierreDeVenta` | `(metodo, ruta) => boolean` | Únicas rutas permitidas a una cuenta desactivada con venta. | RF-38 |
| `estadoInactividadVenta` | `(ultimaActividad, hoy) => 'activa' \| 'advertir' \| 'cancelar'` | Aviso a los 10 minutos y cancelación a los 15. | RF-38 |
| `segundosParaCancelar` | `(ultimaActividad, hoy) => number` | Cuenta regresiva para la interfaz. | RF-38 |
| `puedeRecuperarAdministrador` | `(rol, tieneCodigo, coincide) => boolean` | Recuperación solo para administrador con código válido. | RF-29, 31 |

No se implementa `puedeCambiarRol`: el cambio de rol pertenece a fase 2 (RF-32).

---

## 3. Algoritmo en pseudocódigo

### A. Inicio de sesión y emisión de JWT (RF-1–7, RF-33)

```text
FUNCIÓN iniciarSesion(peticion):
  usuario = normalizarIdentificador(peticion.usuario)
  contrasena = peticion.contrasena

  SI NO credencialesCompletas(usuario, contrasena):
    RESPONDER 400 "Debes ingresar usuario y contraseña"        // RF-3

  cuenta = buscarPorUsuario(usuario)

  SI cuenta ES NULA:
    RESPONDER 401 "Usuario o contraseña incorrectos"           // RF-2, RNF-4

  bloqueo = estadoDeBloqueo(cuenta.intentos_fallidos,
                            cuenta.bloqueado_hasta, hoy)
  SI bloqueo.bloqueado:
    RESPONDER 429 "Demasiados intentos. Intenta en X minutos"  // RF-5

  SI NO coincide(contrasena, cuenta.password_hash):
    siguiente = siguienteIntento(cuenta.intentos_fallidos, falso, hoy)
    actualizarIntentos(cuenta.id, siguiente)
    SI siguiente.intentos >= 5:
      RESPONDER 429 "Demasiados intentos. Intenta en 15 minutos" // RF-4
    RESPONDER 401 "Usuario o contraseña incorrectos"             // RF-2

  SI NO cuenta.activo:
    RESPONDER 403 "Esta cuenta está desactivada..."              // RF-7

  reiniciarIntentos(cuenta.id)                                   // RF-6
  token = firmarJWT({ id, nombre, rol, version }, 8 horas)       // RF-33
  RESPONDER 200 { token, usuario: datosPublicos(cuenta) }        // RF-1
```

### B. Verificación de autenticación y rol (RF-9, RF-14–16, RF-22, RF-33–38)

```text
MIDDLEWARE autenticar(peticion):
  token = leer "Bearer" de la cabecera
  SI NO token:
    RESPONDER 401 "No autenticado..."                            // RF-16

  datos = verificarFirma(token)
  SI firma inválida:
    RESPONDER 401 "Token inválido..."                            // RF-16
  SI token vencido:
    datos = decodificarSinVerificar(token)   // la firma ya fue válida

  cuenta = buscarPorId(datos.id)
  SI cuenta ES NULA:
    RESPONDER 401 "Tu cuenta ya no existe..."                    // RF-16

  ventaActiva = buscarVentaEnCurso(cuenta.id)
  SI ventaActiva Y estadoInactividadVenta(ventaActiva.ultima_actividad, hoy) = 'cancelar':
    cancelarAutomaticamente(ventaActiva, hoy)                    // RF-38
    ventaActiva = nula

  SI datos.version != cuenta.token_version:
    RESPONDER 401 "La sesión fue cerrada o la contraseña cambió" // RF-34, RNF-8

  SI sesionAceptable(datos.exp, hoy, ventaActiva) = 'expirada':
    RESPONDER 401 "Tu sesión de 8 horas expiró"                  // RF-36

  SI NO cuenta.activo Y NO ventaActiva:
    RESPONDER 403 "Esta cuenta está desactivada..."              // RF-7, RF-38

  SI NO cuenta.activo Y ventaActiva Y NO esRutaDeCierreDeVenta(metodo, ruta):
    RESPONDER 403 "Termina o cancela la venta antes de continuar" // RF-38

  SI debeCambiarContrasena(cuenta.requiere_cambio_contrasena, ruta):
    RESPONDER 403 "Debes cambiar tu contraseña temporal..."      // RF-22

  peticion.usuario = { id, nombre, rol, activo, ventaActiva }
  CONTINUAR

MIDDLEWARE requiereRol(...rolesPermitidos):
  SI peticion.usuario.rol NO ESTÁ EN rolesPermitidos:
    RESPONDER 403 "No tienes permisos para realizar esta acción" // RF-9, RF-14
  CONTINUAR
```

### C. Gestión de cuentas y contraseñas (RF-18–29, RF-31)

```text
FUNCIÓN crearCuenta(admin, datos):
  usuario = normalizarIdentificador(datos.usuario)
  validar nombre, identificador y rol                            // RF-18
  SI NO esIdentificadorValido(usuario):
    RESPONDER 400 "El usuario debe tener entre 3 y 50 caracteres válidos"
  SI existeCuenta(usuario):
    RESPONDER 409 "Ya existe una cuenta con ese usuario"         // RF-19

  SI datos.rol = 'administrador':
    SI NO esContrasenaValida(datos.contrasena, usuario):
      RESPONDER 400 "La contraseña debe tener al menos 8 caracteres
                     y no puede ser igual al usuario"            // RF-20
    codigo = generarCodigoRecuperacion()
    crearCuenta(..., hash(contrasena), hash(codigo))
    RESPONDER 201 { codigo }   // se muestra una sola vez         // RF-20

  SINO:
    temporal = generarContrasenaTemporal()
    crearCuenta(..., hash(temporal), requiereCambio = verdadero)
    RESPONDER 201 { contrasenaTemporal }  // una sola vez         // RF-21

FUNCIÓN desactivarCuenta(admin, id):
  TRANSACCIÓN:
    objetivo = bloquearFilaUsuario(id)
    adminsActivos = contarAdministradoresActivosBloqueando()

    SI NO puedeDesactivar(objetivo.rol, objetivo.activo, adminsActivos):
      ROLLBACK
      RESPONDER 409 "Debe quedar al menos un Administrador activo" // RF-26

    ventaActiva = buscarVentaEnCurso(objetivo.id)
    SI ventaActiva:
      // No se invalida el token: la persona debe poder cerrar la venta.
      actualizarActivo(id, falso)                                  // RF-38
    SINO:
      actualizarActivo(id, falso)
      incrementarVersionToken(id)                                  // RF-23, RNF-8

  COMMIT
  RESPONDER 200 (si hay venta: "podrá terminarla o cancelarla")     // RF-38

FUNCIÓN reactivarCuenta(admin, id):
  actualizarActivo(id, verdadero)
  RESPONDER 200 "Cuenta activada correctamente"                    // RF-24

FUNCIÓN restablecerContrasena(admin, id):
  objetivo = buscarPorId(id)
  SI objetivo.id = admin.id:
    RESPONDER 400 "Usa la opción de cambiar tu propia contraseña"  // RF-27, RF-28
  SI tieneVentaEnCurso(objetivo.id):
    RESPONDER 409 "La cuenta tiene una venta en curso..."          // RF-27, RF-38

  adminsActivos = contarAdministradoresActivos()
  SI NO puedeRestablecer(objetivo.rol, objetivo.activo, adminsActivos):
    RESPONDER 409 "Debe quedar al menos un Administrador activo"   // RF-27

  temporal = generarContrasenaTemporal()
  guardarContrasena(id, hash(temporal), requiereCambio = verdadero)
  RESPONDER 200 { contrasenaTemporal }                             // RF-27

FUNCIÓN cambiarContrasena(usuario, actual, nueva):
  SI NO coincide(actual, usuario.password_hash):
    RESPONDER 403 "La contraseña actual es incorrecta"             // RF-28
  SI NO esContrasenaValida(nueva, usuario.usuario):
    RESPONDER 400 "La nueva contraseña debe tener al menos 8 caracteres
                   y no puede ser igual al usuario"                // RF-28
  guardarContrasena(usuario.id, hash(nueva), requiereCambio = falso)
  RESPONDER 200 "Contraseña actualizada. Inicia sesión nuevamente" // RF-28, RNF-8

FUNCIÓN recuperarContrasenaAdmin(peticion):
  SI NO credencialesCompletas(usuario, codigoRecuperacion)
     O NO esContrasenaValida(nuevaContrasena, usuario):
    RESPONDER 400 "Completa los datos y usa una contraseña válida"
  objetivo = buscarPorUsuario(usuario)
  SI NO puedeRecuperarAdministrador(objetivo.rol, tieneCodigo, coincide):
    RESPONDER 401 "Código de recuperación incorrecto o ya utilizado" // RF-29, 31
  consumirCodigoRecuperacion(objetivo.id, hash(nuevaContrasena), codigoAnterior)
  RESPONDER 200 "Contraseña restablecida. Inicia sesión nuevamente"  // RF-29
```

### D. Sesión expirada, cierre de sesión y desactivación con venta (RF-33–39)

```text
FUNCIÓN cerrarSesion(usuario):
  SI NO puedeCerrarSesion(usuario.ventaActiva):
    RESPONDER 409 "Termina o cancela la venta antes de cerrar sesión" // RF-35
  incrementarVersionToken(usuario.id)                                 // RF-34, RNF-8
  RESPONDER 200 "Sesión cerrada correctamente"

FUNCIÓN finalizarVenta(venta):
  TRANSACCIÓN:
    cambiarEstadoVenta(venta.id, 'completada')
    SI usuarioDe(venta).activo = falso:
      incrementarVersionToken(venta.usuario_id)   // cierra el acceso ya
  COMMIT                                                              // RF-38

FUNCIÓN cancelarVenta(venta):
  TRANSACCIÓN:
    cambiarEstadoVenta(venta.id, 'anulada')
    SI usuarioDe(venta).activo = falso:
      incrementarVersionToken(venta.usuario_id)
  COMMIT                                                              // RF-38

FUNCIÓN cancelarAutomaticamente(venta, hoy):
  TRANSACCIÓN:
    cambiarEstadoVenta(venta.id, 'cancelada_automaticamente')
    incrementarVersionToken(venta.usuario_id)
  COMMIT                                                              // RF-38

FRONTEND:
  SI respuesta HTTP = 401:
    borrar token y usuario locales
    guardar aviso en sessionStorage
    redirigir a /login                                                // RF-16, 34, 36
  SI respuesta HTTP = 403:
    mostrar mensaje del backend sin redirigir                         // RF-14
```

---

## 4. Cómo se pinta en la interfaz

### Navegación general

- **Barra superior (RF-10, RF-12, RF-17):** muestra `Sesión: <nombre> (<rol>)` y el botón “Cerrar sesión”.
- **Cajero:** ve solo “Ventas” e “Inventario”. No ve “Clientes y Fiado”, “Historial de ventas” ni “Cuentas”.
- **Administrador:** ve además “Clientes y Fiado”, “Historial de ventas” y “Cuentas”.
- **RF-14:** si un cajero escribe una dirección de administrador, `RutaProtegida` pinta `SinPermisos` con el mensaje “No tienes permisos para acceder a esta sección” y un botón “Volver a ventas”. No se muestran datos.

### `/login` (RF-1–3, RF-31)

- Formulario con usuario y contraseña, botón “Iniciar sesión” y estado “Ingresando…”.
- Errores genéricos: “Usuario o contraseña incorrectos”, “Demasiados intentos. Intenta en X minutos”, “Esta cuenta está desactivada…”.
- Aviso de sesión cerrada o expirada cuando llega desde el interceptor.
- Enlace “Recuperar acceso” con la aclaración: “Solo el administrador puede recuperar su acceso con código. Los cajeros deben pedir una nueva contraseña al administrador.”

### `/ventas` (RF-35, RF-37, RF-38)

- Se mantiene el ciclo de venta actual: iniciar, registrar actividad, finalizar y cancelar.
- Si la cuenta fue desactivada con una venta en curso, se muestra un aviso y solo quedan habilitados “Finalizar venta” y “Cancelar venta”.
- Si la sesión venció con una venta en curso, el backend permite cerrarla; si no hay venta, el interceptor redirige a `/login` con el aviso.
- No se agrega el panel de fiado: RF-13 queda para fase 2.

### `/inventario` (RF-10–12)

- **Cajero:** columnas Producto, Precio de venta, Stock y Unidad. Sin costo ni margen.
- **Administrador:** columnas Producto, Costo, Precio de venta, Margen, Stock y Unidad.
- El cajero no ve botones de creación, edición ni cambio de precio.

### `/usuarios` (RF-18–27)

- **Crear cuenta:** nombre, identificador, rol y contraseña solo cuando el rol es Administrador. Para Cajero se informa que se generará una contraseña temporal.
- **Listado:** nombre, identificador, rol, estado y última actualización.
- **Acciones por fila:**
  - Activar o desactivar.
  - Restablecer contraseña.
  - Si es el último administrador activo, las acciones que lo dejarían sin acceso se muestran deshabilitadas con explicación.
- **Modal de secreto único:** muestra la contraseña temporal o el código de recuperación una sola vez, con el texto “No se volverá a mostrar” y el botón “Ya lo guardé”.
- Sin cambio de rol, sin auditoría y sin botón de regenerar código: fase 2.

### `/cambiar-contrasena` (RF-22, RF-28)

- Se muestra automáticamente si `requiereCambioContrasena` es verdadero.
- Campos: contraseña actual, nueva y confirmación.
- Validación visible: mínimo 8 caracteres y distinta del identificador.
- Al guardar, se limpia la sesión y se vuelve a `/login` con el mensaje “Contraseña actualizada”.

### `/recuperar-contrasena` (RF-29, RF-31)

- Formulario: usuario, código de recuperación, nueva contraseña y confirmación.
- Texto: “Solo para cuentas de administrador”.
- Error uniforme: “Código de recuperación incorrecto o ya utilizado”.

### Sesión expirada y cierre (RF-33–36)

- No se usa un temporizador local de expiración: el backend es la autoridad y la gracia por venta en curso se decide allí.
- Cualquier respuesta 401 limpia la sesión, guarda el motivo y redirige a `/login`.
- El cierre manual exitoso limpia la sesión y redirige a `/login`.
- Si hay una venta en curso, el cierre se rechaza y se muestra “Termina o cancela la venta antes de cerrar sesión”.
- El cierre en una pestaña se refleja en las demás mediante el evento de almacenamiento local.

---

## 5. Decisiones técnicas justificadas

| Decisión | Por qué | Alternativa descartada | RF |
|---|---|---|---|
| JWT sin refresh token + `token_version` en la cuenta | Permite invalidar de inmediato al cerrar sesión, desactivar o cambiar contraseña, sin una tabla de sesiones. | JWT puro: no se puede revocar antes de las 8 horas. Sesiones en base de datos: más estado y limpieza. | RF-34, RNF-8 |
| Sesión fija de 8 horas, sin renovación automática | Coincide con la spec y con un equipo compartido en el mesón. | Refresh token o sesión deslizante: contradice RF-33 y RF-36. | RF-33, RF-36 |
| Autorización en backend + guard en frontend | El backend es la autoridad; el guard solo mejora la experiencia. | Solo frontend: cualquiera podría llamar a la API directamente. | RF-9, RF-14, RF-15 |
| `bcryptjs` para contraseñas y códigos | Hash lento con sal; ya está en el stack. | SHA-256 o hash simple: demasiado rápido y vulnerable a fuerza bruta. | RNF-1 |
| Secretos de un solo uso hasheados y mostrados una vez | No quedan en texto legible ni se pueden recuperar después. | Guardarlos en texto plano o permitir consultarlos: filtración. | RF-20, RF-21, RF-29, RNF-2 |
| Proyección por rol en el modelo de productos | Evita que el costo salga del backend; no basta con ocultarlo en la interfaz. | Filtrar solo en React: el dato igual viaja en la respuesta. | RF-11, RF-12 |
| Guarda del último administrador en transacción | Evita que dos desactivaciones simultáneas dejen cero administradores. | Validar solo en la interfaz o con un conteo previo sin bloqueo: condición de carrera. | RF-26, RF-27 |
| Venta en curso como fuente de verdad (`ventas.estado`) | Evita flags desincronizados y permite la gracia de sesión. | Campo `venta_en_curso` en `usuarios`: ya fue reemplazado y se desincroniza. | RF-37, RF-38 |
| Desactivar sin invalidar el token si hay venta en curso | Permite terminar o cancelar la venta y luego retirar el acceso. | Invalidar siempre: la persona no podría cerrar la venta. | RF-38 |
| Bloquear restablecimiento con venta en curso | Evita perder una venta abierta por un cambio administrativo. | Permitirlo: la venta queda huérfana y se cancela sola. | RF-27, RF-38 |
| Sin temporizador local de expiración | El backend decide la gracia por venta en curso; un temporizador la rompería. | Temporizador en React: expulsaría al cajero antes de cerrar la venta. | RF-33, RF-36, RF-37 |
| `localStorage` para el token en el MVP | Simplicidad y mismo origen; la app no renderiza HTML de terceros. | Cookie `httpOnly`: más segura, pero exige CSRF y más configuración. | RF-16, RNF-1 |
| `node --test` para unitarias e integración | Sin dependencias nuevas; Node 20 ya lo incluye. | Jest o Vitest: más dependencias sin necesidad demostrada. | RNF-6 |
| Sin framework de pruebas de frontend | El módulo es pequeño y se valida con checklist manual; evita sumar librerías. | Vitest + Testing Library: útil, pero fuera del stack actual. | RNF-6 |
| Diferir fiado, auditoría, rol y regeneración | El MVP prioriza operar y proteger la caja; esas funciones no bloquean el ingreso, la venta ni la gestión básica de cuentas. | Incluirlas ahora: sumaría tareas y complejidad sin necesidad para el MVP. | RF-13, RF-30, RF-32, RNF-9 |

---

## 6. Estrategia de pruebas

### 6.1 Pruebas unitarias (`npm test`, `node --test`)

| Prueba | Función | RF |
|---|---|---|
| Credenciales vacías o con espacios se rechazan | `credencialesCompletas` | RF-3 |
| Solo existen dos roles | `esRolValido` | RF-18 |
| Contraseña mínima y distinta del usuario | `esContrasenaValida` | RF-20, RF-28 |
| Bloqueo vigente hasta los 15 minutos | `estadoDeBloqueo` | RF-4, RF-5 |
| Quinto fallo bloquea y el éxito reinicia | `siguienteIntento` | RF-4, RF-6 |
| Sesión vencida solo se acepta con venta en curso | `sesionAceptable` | RF-33, RF-36, RF-37 |
| Cierre bloqueado durante venta | `puedeCerrarSesion` | RF-35 |
| Cajero siempre desactivable; administrador solo si queda otro | `puedeDesactivar` | RF-26 |
| Restablecimiento de administrador con guarda | `puedeRestablecer` | RF-27 |
| Contraseña temporal bloquea rutas | `debeCambiarContrasena` | RF-22 |
| Solo finalizar o cancelar para desactivado | `esRutaDeCierreDeVenta` | RF-38 |
| Aviso a los 10 minutos y cancelación a los 15 | `estadoInactividadVenta` | RF-38 |
| Cuenta regresiva no negativa | `segundosParaCancelar` | RF-38 |
| Recuperación solo administrador con código | `puedeRecuperarAdministrador` | RF-29, RF-31 |
| Identificador normalizado y válido | `normalizarIdentificador`, `esIdentificadorValido` | RF-18, RF-19 |

### 6.2 Pruebas de integración (`npm run test:integracion`, MySQL real)

| Escenario | RF |
|---|---|
| Administrador ingresa y recibe JWT de 8 horas | RF-1, RF-33 |
| Credenciales inválidas dan mensaje genérico | RF-2, RNF-4 |
| Credenciales vacías no cuentan como intento | RF-3 |
| Cinco fallos bloquean 15 minutos; el éxito reinicia | RF-4, RF-5, RF-6 |
| Cuenta desactivada no ingresa | RF-7 |
| Cajero creado con temporal, forzado a cambiarla | RF-21, RF-22 |
| Cajero no accede a rutas de administrador | RF-9, RF-10, RF-12, RF-14 |
| Cajero recibe productos sin `precio_costo`; administrador sí | RF-11, RF-12 |
| Administrador crea otro administrador y recibe código | RF-20 |
| Desactivar cajero impide ingreso y conserva historial | RF-23 |
| Reactivar cajero permite ingreso | RF-24 |
| No se puede desactivar ni restablecer al último administrador | RF-26, RF-27 |
| Un administrador puede desactivar o restablecer a otro si queda uno activo | RF-26, RF-27 |
| Contraseña igual al usuario se rechaza | RF-20, RF-28 |
| Logout bloqueado con venta en curso y permitido al finalizar | RF-35 |
| Sesión vencida sin venta da 401; con venta permite finalizar o cancelar | RF-36, RF-37 |
| Desactivado con venta solo puede finalizar o cancelar y luego pierde acceso | RF-38 |
| Cancelación manual de una cuenta desactivada invalida el token | RF-38, RNF-8 |
| Venta abandonada se cancela a los 15 minutos y aparece en historial | RF-38 |
| Respuestas no incluyen hashes ni contraseñas | RNF-3 |
| Mensajes principales están en español | RNF-7 |

### 6.3 Verificación manual de interfaz

| Verificación | RF |
|---|---|
| Login válido, inválido, vacío y bloqueado | RF-1–5 |
| Cajero cae en `/ventas` y no ve opciones de administrador | RF-10, RF-12, RF-15 |
| Cajero entra por URL directa a `/usuarios` y ve `SinPermisos` | RF-14 |
| Administrador crea cajero y ve la contraseña temporal una sola vez | RF-21 |
| Administrador crea administrador y ve el código una sola vez | RF-20 |
| Se deshabilita la acción sobre el último administrador | RF-26 |
| Cajero ve inventario sin costo ni margen | RF-11, RF-12 |
| Administrador ve costo y margen | RF-10 |
| Sesión expirada redirige a login con aviso | RF-36 |
| Cierre con venta en curso se rechaza; sin venta se permite | RF-35 |
| Cierre en una pestaña limpia las demás | RF-34 |
| Todos los textos visibles están en español | RNF-7 |

---

## Secuencia de implementación

1. Funciones puras y sus pruebas unitarias.
2. Modelo de usuarios con guardas y cambios de estado.
3. Controlador y rutas de cuentas, contraseñas y recuperación.
4. Middleware de sesión y cierre de ventas.
5. Productos sin costo para el cajero.
6. Tipos, contexto y cliente HTTP del frontend.
7. Vistas y componentes de interfaz.
8. Pruebas de integración y checklist manual.
9. Actualización de `README.md` y `MEMORY.md` al cierre.

## Riesgos y cuidados

- **No romper el ciclo de venta actual:** los cambios de desactivación tocan `token_version`; probar finalizar, cancelar y cancelación automática.
- **Costo oculto:** el frontend debe tolerar que `precio_costo` no venga en la respuesta del cajero.
- **Sin migración:** no se crea `auditoria_cuentas` en el MVP; la base actual no cambia.
- **Sin fiado en el POS:** RF-13 queda para fase 2; no agregar `ConsultaFiado` ni endpoints de saldo en este módulo.
- **Sin rol ni regeneración:** la interfaz no debe ofrecer cambio de rol ni regenerar código; el backend tampoco expone esas rutas.
- **MySQL real:** las pruebas de integración requieren una instancia disponible; el entorno actual no la tiene según `MEMORY.md`.
