# AGENTS.md — AlmacenPro

## 1. Descripción

AlmacenPro es un sistema de inventario, ventas y fiado (cuenta corriente) para pequeños almacenes
de barrio y minimarkets chilenos.

Su objetivo: que el dueño opere sin fricción tecnológica.
**Criterio de éxito del MVP:** registrar una venta completa en menos de 30 segundos, ver el stock
actualizado y conocer la deuda de fiado de un vistazo.

## 2. Stack y estructura

- **Frontend:** React + TypeScript + Vite. Proxy `/api` → backend en puerto 4000.
- **Backend:** Node.js + Express (ESM), MySQL con `mysql2` (promesas, pool) y JWT.
- Directorios principales:
  - `backend/src/` — capas `routes/ → controllers/ → models/`, más `config/` (env y pool MySQL)
    y `middlewares/` (JWT, roles, errores). Sin SQL fuera de los modelos.
  - `backend/database/` — `schema.sql` (tablas + vista `v_saldo_fiado`) y `seed.js` (admin inicial).
  - `frontend/src/` — `views/` (pantallas por módulo), `components/`, `context/` (autenticación),
    `services/` (cliente axios con token) y `types/`.
  - `docs/` — constitución del proyecto.
  - `specs/` — especificaciones numeradas (ej. `specs/001-autenticacion-y-roles/spec.md`).

## 3. Comandos clave

```bash
# Backend (desde backend/): requiere .env con credenciales MySQL y JWT_SECRET
npm install
npm run dev                     # API en http://localhost:4000
npm test                        # reglas de negocio de autenticación

# Base de datos (desde backend/, MySQL 8+)
mysql -u root -p < database/schema.sql   # crear BD y tablas
npm run seed                             # crear usuario administrador inicial

# Frontend (desde frontend/)
npm install
npm run dev                     # app en http://localhost:5173
```

## 4. Convenciones y reglas

- **Idioma:** 100% en español — identificadores, comentarios, mensajes de API e interfaz.
  Montos en CLP y RUT chileno (`12.345.678-5`) cuando aplique.
- **Atomicidad:** ventas, stock y fiado se escriben en UNA transacción SQL (todo o nada).
  El stock nunca queda negativo y los precios del detalle se congelan al vender.
- **Antes de empezar cualquier tarea:** leer `docs/constitution.md` y `MEMORY.md`.
  Ambos son la fuente de verdad de principios y contexto; la spec manda sobre el código.
