// Cuentas de la demostración pública. Solo existen en la base que crea `npm run demo`, y el inicio
// de sesión las muestra únicamente cuando el servidor corre con MODO_DEMO=true.
// Las contraseñas son públicas a propósito: nunca usar estas cuentas en un almacén real.
export const CUENTAS_DEMO = [
  {
    nombre: 'Administrador demo',
    usuario: 'admin.demo',
    password: 'demo-admin',
    rol: 'administrador',
  },
  {
    nombre: 'Cajero demo',
    usuario: 'cajero.demo',
    password: 'demo-cajero',
    rol: 'cajero',
  },
];

// Se lee en cada llamada (y no al arrancar) para que las pruebas puedan activarlo y desactivarlo.
export function esModoDemo() {
  return process.env.MODO_DEMO === 'true';
}
