// Semilla de datos: crea el usuario administrador inicial y entrega su código de recuperación.
// Uso: node database/seed.js
import { pool } from '../src/config/db.js';
import * as usuariosModelo from '../src/models/usuarios.model.js';
import { cifrar, generarCodigoRecuperacion } from '../src/services/credenciales.js';

const nombreAdmin = process.env.ADMIN_NOMBRE ?? 'Administrador';
const usuarioAdmin = process.env.ADMIN_USUARIO ?? 'admin';
const passwordAdmin = process.env.ADMIN_PASSWORD ?? 'admin123'; // cambiar al primer ingreso

async function crearAdministrador() {
  const existente = await usuariosModelo.buscarPorUsuario(usuarioAdmin);
  if (existente) {
    console.log('El usuario administrador ya existe; no se modificó su contraseña ni su código.');
    return;
  }

  const passwordHash = await cifrar(passwordAdmin);
  const codigoRecuperacion = generarCodigoRecuperacion();
  const codigoHash = await cifrar(codigoRecuperacion);

  await usuariosModelo.crear({
    nombre: nombreAdmin,
    usuario: usuarioAdmin,
    passwordHash,
    rol: 'administrador',
    codigoRecuperacionHash: codigoHash,
  });

  console.log('Usuario administrador creado:');
  console.log(`  Usuario:   ${usuarioAdmin}`);
  console.log(`  Contraseña: ${passwordAdmin} (definida en ADMIN_PASSWORD; cámbiala al primer ingreso)`);
  console.log(`  CÓDIGO DE RECUPERACIÓN: ${codigoRecuperacion}`);
  console.log('  Guarda este código en un lugar seguro: no se volverá a mostrar');
}

crearAdministrador()
  .then(() => pool.end())
  .catch((error) => {
    console.error('Error al crear el administrador. ¿Ya ejecutaste database/schema.sql?');
    console.error(error.message);
    process.exit(1);
  });
