// Configuración central de Express: middlewares globales y montaje de rutas.
import express from 'express';
import cors from 'cors';
import { manejarErrores } from './middlewares/errores.js';
import authRutas from './routes/auth.routes.js';
import productosRutas from './routes/productos.routes.js';
import ventasRutas from './routes/ventas.routes.js';
import clientesRutas from './routes/clientes.routes.js';
import reportesRutas from './routes/reportes.routes.js';
import cierresCajaRutas from './routes/cierresCaja.routes.js';

export const app = express();

// Middlewares globales
app.use(cors()); // en producción, restringir el origen al dominio del frontend
app.use(express.json());

// Mensaje simple de estado de la API
app.get('/api', (_req, res) => {
  res.json({ mensaje: 'API de AlmacenPro funcionando correctamente' });
});

// Rutas por módulo
app.use('/api/auth', authRutas);
app.use('/api/productos', productosRutas);
app.use('/api/ventas', ventasRutas);
app.use('/api/clientes', clientesRutas);
app.use('/api/reportes', reportesRutas);
app.use('/api/cierres-caja', cierresCajaRutas);

// Manejo centralizado de errores: siempre al final de la cadena
app.use(manejarErrores);
