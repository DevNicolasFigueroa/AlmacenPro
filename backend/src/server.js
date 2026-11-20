// Punto de entrada del backend.
import { app } from './app.js';
import { env } from './config/env.js';
import { verificarConexion } from './config/db.js';
import { iniciarBarrido, detenerBarrido } from './services/ventasVencidas.js';

verificarConexion().then(() => {
  // RF-24 y RF-25: revisión al arrancar y cada 30 segundos.
  iniciarBarrido();

  const servidor = app.listen(env.puerto, () => {
    console.log(`Servidor AlmacenPro escuchando en http://localhost:${env.puerto}`);
  });

  function detener() {
    detenerBarrido();
    servidor.close(() => process.exit(0));
  }

  process.on('SIGINT', detener);
  process.on('SIGTERM', detener);
});
