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
│   │   ├── app.js               # Configuración de Express
│   │   └── server.js            # Punto de entrada (escucha HTTP)
│   └── package.json
├── frontend/                    # SPA (React + TypeScript + Vite)
│   └── src/
│       ├── components/          # Componentes reutilizables (UI)
│       ├── context/             # Contexto global de autenticación
│       ├── services/            # Cliente HTTP (axios) y llamadas a la API
│       ├── types/               # Tipos e interfaces TypeScript
│       ├── views/               # Vistas por módulo (Login, POS, etc.)
│       ├── App.tsx              # Rutas y protección por rol
│       └── main.tsx             # Punto de entrada
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
```

La migración 003 (productos e inventario) convierte el stock a decimales para vender por kilo, limita la
unidad a `unidad` o `kilo`, impide el stock negativo y crea `movimientos_stock`. Se detiene sin cambiar
nada si hay productos con stock negativo. Haz un respaldo antes de ejecutarla. En PowerShell, que no admite
el operador `<`, usa: `Get-Content database/migration_003_spec002.sql -Raw -Encoding utf8 | mysql -u root -p almacenpro`.

### 2. Backend

```bash
cd backend
cp .env.example .env          # editar credenciales de MySQL y JWT_SECRET
npm install
node database/seed.js         # crea el administrador y muestra su código de recuperación
npm test                      # reglas de negocio de las specs 001 y 002 (sin base de datos)
npm run test:integracion      # endpoints contra MySQL (crea y borra almacenpro_test y almacenpro_test_inventario)
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
| PATCH | `/api/auth/usuarios/:id/estado` | administrador | Activar o desactivar solo cajeros |
| PATCH | `/api/auth/usuarios/:id/contrasena` | administrador | Contraseña temporal para cajeros |
| POST | `/api/ventas/iniciar` y `/finalizar` | sesión | Marca la venta en curso para no interrumpir la sesión |

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

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # App en http://localhost:5173
```

## Módulos del MVP

| Módulo              | Descripción                                                       |
| ------------------- | ----------------------------------------------------------------- |
| Autenticación       | Login con JWT, roles administrador / cajero                       |
| Productos           | Alta, edición y stock con soporte de código de barras             |
| Ventas (POS)        | Registro de venta rápido con descuento automático de stock        |
| Clientes y fiado    | Cuenta corriente por cliente (opcionalmente con RUT chileno)      |
| Reportes básicos    | Ventas del día / período, productos con stock bajo, saldos de fiado |
