// Controlador de clientes y fiado (cuenta corriente).
// Funciones previstas:
//  - CRUD de clientes (con RUT chileno opcional, formato 12.345.678-5).
//  - Consulta del saldo de fiado (vista SQL "v_saldo_fiado").
//  - Cargos (ventas al fiado) y abonos (pagos parciales o totales).
// Implementación pendiente; seguir el patrón de productos.controller.js.
export function listar(req, res) {
  res.status(501).json({ mensaje: 'Listado de clientes: implementación pendiente' });
}
