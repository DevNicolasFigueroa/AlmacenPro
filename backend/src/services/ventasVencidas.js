// Barrido de ventas abandonadas (spec 001, RF-24 y RF-25).
// La hora se toma aquí, en la capa de servicio: las reglas puras la reciben como parámetro.
import * as ventasModelo from '../models/ventas.model.js';
import { estadoInactividadVenta } from '../utils/validaciones.js';

const INTERVALO_BARRIDO_MS = 30_000;

let temporizador = null;
let enEjecucion = false;

export async function barrerVentasVencidas(ahora = new Date()) {
  if (enEjecucion) return 0;
  enEjecucion = true;

  try {
    const ventas = await ventasModelo.listarEnCurso();
    let canceladas = 0;

    for (const venta of ventas) {
      if (estadoInactividadVenta(venta.ultima_actividad, ahora) === 'cancelar') {
        if (await ventasModelo.cancelarAutomaticamente(venta, ahora)) {
          canceladas += 1;
        }
      }
    }

    return canceladas;
  } finally {
    enEjecucion = false;
  }
}

export function iniciarBarrido() {
  if (temporizador) return;

  // Al arrancar se recupera el tiempo en que el servidor estuvo detenido.
  barrerVentasVencidas().catch((error) => {
    console.error('No se pudo revisar las ventas abandonadas al iniciar:', error.message);
  });

  temporizador = setInterval(() => {
    barrerVentasVencidas().catch((error) => {
      console.error('No se pudo barrer las ventas abandonadas:', error.message);
    });
  }, INTERVALO_BARRIDO_MS);

  temporizador.unref?.();
}

export function detenerBarrido() {
  if (temporizador) {
    clearInterval(temporizador);
    temporizador = null;
  }
}
