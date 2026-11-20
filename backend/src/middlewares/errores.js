// Manejo centralizado de errores de la API.
// Los controladores llaman a next(error) y aquí se traduce a una respuesta JSON.

export function manejarErrores(error, _req, res, _siguiente) {
  console.error(error);

  // Errores de MySQL (por ejemplo, clave duplicada o datos demasiado largos)
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ mensaje: 'El valor ingresado ya está registrado' });
  }

  // Errores de validación generados por los controladores
  if (error.estado && error.mensaje) {
    return res.status(error.estado).json({ mensaje: error.mensaje });
  }

  return res.status(500).json({ mensaje: 'Error interno del servidor' });
}

// Helper para lanzar errores con código HTTP desde los controladores.
export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}
