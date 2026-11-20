// Controlador de reportes básicos del MVP.
// Reportes previstos (solo rol administrador):
//  - Ventas por día / período y total recaudado.
//  - Productos con stock igual o menor al mínimo.
//  - Saldos de fiado pendientes por cliente.
// Implementación pendiente; seguir el patrón de productos.controller.js.
export function ventasDelDia(req, res) {
  res.status(501).json({ mensaje: 'Reporte de ventas del día: implementación pendiente' });
}
