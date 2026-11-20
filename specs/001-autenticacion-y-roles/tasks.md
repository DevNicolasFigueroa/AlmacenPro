# Tareas 001 — Autenticación y roles (MVP)

**Alcance MVP:** RF-1–12, RF-14–29, RF-31 y RF-33–39.
**Diferidos a fase 2:** RF-13 (consulta de fiado), RF-30 (regenerar código), RF-32 (auditoría y cambio de rol) y RNF-9.

Ordenadas por dependencia. Cada tarea se verifica antes de pasar a la siguiente.

- [ ] **T1. Ajustar las funciones puras de autenticación y sus pruebas unitarias (≈30 min).** RF-3, RF-4, RF-5, RF-6, RF-18, RF-19, RF-20, RF-22, RF-26, RF-27, RF-28, RF-33, RF-35, RF-36, RF-37, RF-38.
  Hecho cuando: `npm test` pasa y cubre credenciales vacías, bloqueo de 15 minutos, contraseña distinta del usuario, guardas del último administrador, gracia de sesión, cierre con venta y rutas de cierre permitidas.

- [ ] **T2. Implementar las guardas y los cambios de estado en el modelo de usuarios (≈30 min).** RF-23, RF-24, RF-25, RF-26, RF-27, RF-34, RF-38.
  Hecho cuando: el modelo cuenta administradores activos con bloqueo, permite activar o desactivar administradores solo si queda otro, conserva el token durante una venta en curso y no expone eliminación de cuentas.

- [ ] **T3. Ajustar la creación de cuentas, el ingreso y la política de contraseñas (≈30 min).** RF-7, RF-8, RF-18, RF-19, RF-20, RF-21, RF-28, RF-29, RF-31.
  Hecho cuando: crear administrador exige contraseña válida y distinta del usuario y devuelve el código una sola vez; crear cajero devuelve la temporal una sola vez; un identificador duplicado responde 409; una cuenta desactivada no ingresa; no existe ruta pública de registro; la semilla obliga a cambiar la contraseña inicial.

- [ ] **T4. Implementar desactivación, reactivación y restablecimiento con guarda del último administrador (≈30 min).** RF-23, RF-24, RF-26, RF-27, RF-34, RF-38.
  Hecho cuando: no se puede desactivar ni restablecer al último administrador activo; desactivar con venta en curso no invalida el token hasta terminarla o cancelarla; restablecer cierra las sesiones de la cuenta; las respuestas usan mensajes en español.

- [ ] **T5. Ajustar el middleware de sesión y la invalidación al cerrar ventas (≈30 min).** RF-9, RF-14, RF-15, RF-16, RF-22, RF-33, RF-34, RF-35, RF-36, RF-37, RF-38, RF-39.
  Hecho cuando: un token vencido sin venta responde 401; con venta permite finalizar o cancelar; un cajero recibe 403 con mensaje claro; una cuenta desactivada con venta solo accede a finalizar o cancelar; cancelar manualmente también invalida el token de una cuenta desactivada.

- [ ] **T6. Ocultar costo y margen al cajero en productos e inventario (≈25 min).** RF-11, RF-12.
  Hecho cuando: `GET /api/productos` como cajero no incluye `precio_costo`; como administrador sí; el inventario del cajero no muestra costo ni margen y el del administrador sí.

- [ ] **T7. Construir la base del frontend de sesión, permisos y navegación (≈30 min).** RF-10, RF-12, RF-14, RF-15, RF-16, RF-17, RF-34, RF-36.
  Hecho cuando: el cajero solo ve Ventas e Inventario; una URL directa a `/usuarios` muestra `SinPermisos` sin redirigir; un 401 limpia la sesión y vuelve a login con aviso; el cierre en una pestaña limpia las demás; la barra muestra nombre y rol.

- [ ] **T8. Completar la vista de gestión de cuentas (≈30 min).** RF-18, RF-19, RF-20, RF-21, RF-23, RF-24, RF-25, RF-26, RF-27.
  Hecho cuando: el administrador crea cuentas, ve cada secreto una sola vez, activa o desactiva, restablece contraseñas y ve deshabilitadas las acciones que dejarían sin administrador; no existe botón de eliminar, cambiar rol ni regenerar código.

- [ ] **T9. Ajustar las vistas de ingreso, cambio y recuperación de contraseña (≈25 min).** RF-1, RF-2, RF-3, RF-22, RF-28, RF-29, RF-31.
  Hecho cuando: el login muestra errores genéricos y el tiempo de bloqueo; el cambio de contraseña exige la actual y la política; la recuperación solo funciona para administrador con código válido y no permite cajeros.

- [ ] **T10. Escribir las pruebas de integración y completar el checklist del MVP (≈30 min).** RF-1–12, RF-14–29, RF-31, RF-33–39.
  Hecho cuando: `npm test` pasa, las pruebas de integración del MVP están escritas y el checklist manual se completa en un entorno con MySQL real.
