// Carga y expone las variables de entorno centralizadas.
// Todos los nombres internos van en español para mantener coherencia con el dominio.
import 'dotenv/config';

export const env = {
  puerto: Number(process.env.PORT ?? 4000),

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    puerto: Number(process.env.DB_PORT ?? 3306),
    usuario: process.env.DB_USER ?? 'root',
    contrasena: process.env.DB_PASSWORD ?? '',
    nombre: process.env.DB_NAME ?? 'almacenpro',
  },

  jwt: {
    secreto: process.env.JWT_SECRET ?? '',
    // La duración de la sesión es fija (8 horas) y vive en services/credenciales.js.
  },
};

// El secreto JWT es obligatorio: si falta, se detiene el arranque
// para no emitir tokens firmados con valores inseguros por descuido.
if (!env.jwt.secreto) {
  console.error('Error de configuración: define JWT_SECRET en el archivo .env');
  process.exit(1);
}
