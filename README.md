# AlmacenPro

Sistema de inventario, ventas y clientes para almacenes de barrio y minimarkets chilenos.

- **Frontend:** React + TypeScript (Vite)
- **Backend:** Node.js + Express
- **Base de datos:** MySQL
- **Autenticación:** JWT con roles (`administrador` / `cajero`)

## Estructura del proyecto

```
AlmacenPro/
├── backend/                     # API REST (Node.js + Express)
│   ├── database/                # Scripts SQL y semillas de datos
│   │   ├── schema.sql           # Creación de base de datos y tablas
│   │   └── seed.js              # Usuario administrador inicial
│   ├── src/
│   │   ├── config/              # Variables de entorno y conexión MySQL
│   │   ├── controllers/         # Lógica de cada endpoint (req/res)
│   │   ├── middlewares/         # JWT, verificación de roles y errores
│   │   ├── models/              # Consultas SQL (una por entidad)
│   │   ├── routes/              # Rutas agrupadas por módulo
│   │   ├── services/            # Tareas de fondo (cancelación de ventas abandonadas)
│   │   ├── tests/               # Pruebas de integración contra MySQL
│   │   ├── utils/               # Reglas de negocio puras y sus pruebas unitarias
│   │   ├── app.js               # Configuración de Express
│   │   └── server.js            # Punto de entrada (escucha HTTP)
│   └── package.json
├── frontend/                    # SPA (React + TypeScript + Vite)
│   └── src/
│       ├── components/          # Componentes reutilizables (UI)
│       ├── context/             # Contexto global de autenticación
│       ├── services/            # Cliente HTTP (axios) y llamadas a la API
│       ├── styles/              # Hojas de estilo por módulo
│       ├── types/               # Tipos e interfaces TypeScript
│       ├── utils/               # Formato y validación (RUT, montos)
│       ├── views/               # Vistas por módulo (Login, POS, etc.)
│       ├── App.tsx              # Rutas y protección por rol
│       └── main.tsx             # Punto de entrada
├── docs/
│   └── CONSTITUTION.md          # Los 6 principios innegociables del proyecto
├── specs/                       # Especificaciones numeradas (spec, plan y tareas)
├── AGENTS.md                    # Guía para agentes de código
├── MEMORY.md                    # Estado y decisiones del proyecto entre sesiones
└── README.md
```

## Requisitos previos

- Node.js 20 o superior
- MySQL 8 o superior
- Git

## Puesta en marcha

### 1. Base de datos

```bash
cd backend
mysql -u root -p < database/schema.sql
```

Si la base de datos ya existía antes de la spec 001, aplicar una sola vez las migraciones en orden:

```bash
mysql -u root -p almacenpro < database/migration_001_autenticacion.sql
mysql -u root -p almacenpro < database/migration_002_spec001.sql
mysql -u root -p almacenpro < database/migration_003_spec002.sql
mysql -u root -p almacenpro < database/migration_004_spec003.sql
mysql -u root -p almacenpro < database/migration_005_spec004.sql
```

La migración 003 (productos e inventario) convierte el stock a decimales para vender por kilo, limita la
unidad a `unidad` o `kilo`, impide el stock negativo y crea `movimientos_stock`. Se detiene sin cambiar
nada si hay productos con stock negativo. Haz un respaldo antes de ejecutarla. En PowerShell, que no admite
el operador `<`, usa: `Get-Content database/migration_003_spec002.sql -Raw -Encoding utf8 | mysql -u root -p almacenpro`.

La migración 004 (ventas, clientes por RUT y anulaciones) agrega el estado `cancelada` y los datos de la
anulación, guarda las cantidades de las ventas con 3 decimales (kilos), hace del RUT el identificador
obligatorio y único del cliente (se guarda sin puntos y el nombre pasa a ser opcional) y suma el tipo
`anulacion` al fiado. Se detiene sin cambiar nada si hay clientes sin RUT, RUT repetidos al normalizarlos,
productos repetidos en una misma venta o cargos de fiado duplicados. Las ventas `anulada` que ya existían
eran cancelaciones manuales y pasan a `cancelada`; las `completada` sin productos (cierres de prueba de la
spec 001) también pasan a `cancelada`. Haz un respaldo antes de ejecutarla.

La migración 005 (clientes y fiado) exige tener aplicada antes la 004. Agrega al fiado el tipo
`anulacion_abono`, el método de pago del abono y la referencia al abono anulado (un abono se anula una sola
vez), impide los montos cero o negativos, crea la tabla `cambios_rut` (constancia de cada corrección de RUT)
y hace que la vista `v_saldo_fiado` sume de nuevo los abonos anulados. Se detiene sin cambiar nada si hay
movimientos de fiado con monto cero o negativo. No modifica ningún movimiento ni ningún saldo existente: los
abonos anteriores quedan sin método de pago. Haz un respaldo antes de ejecutarla.

### 2. Backend

```bash
cd backend
cp .env.example .env          # editar credenciales de MySQL y JWT_SECRET
npm install
node database/seed.js         # crea el administrador y muestra su código de recuperación
npm test                      # reglas de negocio de las specs 001 a 004 (sin base de datos)
npm run test:integracion      # endpoints contra MySQL (crea y borra las bases almacenpro_test, almacenpro_test_inventario, almacenpro_test_ventas y almacenpro_test_clientes)
npm run dev                   # API en http://localhost:4000
```

### Autenticación y roles (spec 001)

| Método | Ruta | Acceso | Descripción |
| ------ | ---- | ------ | ----------- |
| POST | `/api/auth/login` | público | Ingreso; sesión fija de 8 horas |
| POST | `/api/auth/recuperar-contrasena` | público | Recuperación local con código de un solo uso |
| POST | `/api/auth/logout` | sesión | Cierre manual (bloqueado durante una venta) |
| POST | `/api/auth/cambiar-contrasena` | sesión | Obligatorio si se usa contraseña temporal |
| GET/POST | `/api/auth/usuarios` | administrador | Listar / crear cuentas |
| PATCH | `/api/auth/usuarios/:id/estado` | administrador | Activar o desactivar cuentas (siempre debe quedar un administrador activo) |
| PATCH | `/api/auth/usuarios/:id/contrasena` | administrador | Restablecer la contraseña de un cajero o de otro administrador: genera una temporal que debe cambiarse al ingresar |
| POST | `/api/ventas/iniciar` | sesión | Abre la venta en curso, que protege la sesión |

### Productos e inventario (spec 002)

| Método | Ruta | Acceso | Descripción |
| ------ | ---- | ------ | ----------- |
| GET | `/api/productos` | sesión | Listado con `buscar`, `categoria` y `estadoStock` (`bajo` o `agotado`); incluye desactivados; el costo solo lo recibe el administrador |
| GET | `/api/productos/resumen-stock` | sesión | Cantidad de productos activos con stock bajo y agotados |
| GET | `/api/productos/categorias` | sesión | Categorías existentes |
| POST | `/api/productos` | administrador | Crear producto (con stock inicial opcional) |
| PUT | `/api/productos/:id` | administrador | Editar datos; el stock no se edita aquí |
| PATCH | `/api/productos/:id/estado` | administrador | Desactivar o reactivar (no existe borrado) |
| POST | `/api/productos/:id/ajustes` | administrador | Ajuste manual de stock: merma, reposición o corrección |
| GET | `/api/productos/:id/movimientos` | administrador | Historial de movimientos de stock |

### Ventas, clientes y fiado (spec 003)

| Método | Ruta | Acceso | Descripción |
| ------ | ---- | ------ | ----------- |
| GET | `/api/productos/vendibles` | sesión | Búsqueda del punto de venta: solo activos, por nombre o código, sin costos |
| GET | `/api/ventas/en-curso` | sesión | Venta en curso con su carrito y total, y la última venta confirmada |
| POST | `/api/ventas/:id/actividad` | sesión | Registra actividad (evita la cancelación a los 15 minutos) |
| POST / PATCH / DELETE | `/api/ventas/:id/lineas[/:productoId]` | sesión | Agregar, cambiar cantidad, quitar una línea o vaciar el carrito |
| POST | `/api/ventas/:id/confirmar` | sesión | Cobra: descuenta stock, guarda la venta y, si es fiado, el cargo, todo en una transacción. Responde 409 si falta stock o hay un producto desactivado |
| POST | `/api/ventas/:id/cancelar` | sesión | Cancela la venta en curso; queda registrada con su carrito |
| GET | `/api/ventas?desde=&hasta=&estado=` | administrador | Historial (hoy por defecto) con resumen del período; solo las completadas suman |
| GET | `/api/ventas/:id` | administrador | Detalle de una venta cerrada |
| POST | `/api/ventas/:id/anular` | administrador | Anula una venta completada con motivo: devuelve el stock y descuenta el fiado |
| GET | `/api/clientes/rut/:rut` | sesión | Cliente, contacto y saldo por RUT |
| POST | `/api/clientes` | sesión | Registra un cliente con solo su RUT (nombre opcional); 409 si ya existe |

### Clientes y fiado (spec 004)

Cajero y administrador ven la cuenta de los clientes, registran abonos y mantienen sus datos. Solo el
administrador anula abonos, ve el total por cobrar y el historial de cambios de RUT.

| Método | Ruta | Acceso | Descripción |
| ------ | ---- | ------ | ----------- |
| GET | `/api/clientes?buscar=&estado=&orden=&pagina=` | sesión | Listado de 25 por página. `buscar`: RUT (con o sin puntos y guion, parcial) o nombre (sin importar mayúsculas ni tildes); `estado`: `deuda`, `a_favor` o `al_dia`; `orden`: `nombre` o `deuda`. El administrador recibe además `resumen` (clientes en deuda y total por cobrar, sin compensar saldos a favor) |
| GET | `/api/clientes/:id/cuenta` | sesión | Cuenta: contacto, saldo, compras y movimientos (abonos con su método y marca de anulado). El administrador recibe además `cambios_rut` |
| GET | `/api/clientes/:id/compras/:ventaId` | sesión | Detalle de una compra completada o anulada de ese cliente, sin costos; 404 si la venta es de otro cliente |
| PATCH | `/api/clientes/:id` | sesión | Agrega, cambia o borra (con texto vacío) nombre, teléfono, correo y dirección |
| PATCH | `/api/clientes/:id/rut` | sesión | Corrige el RUT. Sin `confirmar: true` responde 409 `CONFIRMACION_REQUERIDA` y no cambia nada; un RUT de otro cliente responde 409 `RUT_REPETIDO` (no se unen cuentas); cada cambio queda registrado |
| POST | `/api/clientes/:id/abonos` | sesión | Registra un abono (`monto`, `metodo_pago`: efectivo, débito, crédito o transferencia, `observacion`). Si supera la deuda responde 409 `ABONO_SUPERA_DEUDA` con cuánto quedaría a favor, salvo que venga `confirmar_saldo_a_favor: true` |
| POST | `/api/clientes/:id/abonos/:abonoId/anular` | administrador | Anula un abono con motivo (sin plazo): el abono queda visible, marcado como anulado, y su monto vuelve a la deuda |

Los abonos no se editan ni se borran: no existen rutas para hacerlo.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # App en http://localhost:5173
```

## Módulos del MVP

| Módulo              | Estado | Descripción                                                       |
| ------------------- | ------ | ----------------------------------------------------------------- |
| Autenticación       | Spec 001, implementada | Login con JWT, roles administrador / cajero                       |
| Productos           | Spec 002, implementada | Alta, edición y stock con soporte de código de barras             |
| Ventas (POS)        | Spec 003, implementada | Registro de venta rápido con descuento automático de stock, historial y anulación |
| Clientes y fiado    | Spec 004, implementada | Cuenta corriente por cliente, identificado solo por su RUT: listado con búsqueda, abonos, anulación de abonos, edición de datos y corrección del RUT |
| Reportes básicos    | Pendiente | Ventas del día / período, productos con stock bajo, saldos de fiado |
