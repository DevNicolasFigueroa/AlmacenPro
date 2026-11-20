// VISTA CLIENTES: clientes y saldo de fiado "de un vistazo".
// Funciones previstas: listado con saldo de fiado (vista SQL v_saldo_fiado),
// registro de abonos (pagos) y edición del límite de crédito.
// Implementación pendiente: el backend aún devuelve 501 en GET /clientes.
export function VistaClientes() {
  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h2 className="pagina-titulo">Clientes y fiado</h2>
          <p className="pagina-descripcion">Cuenta corriente de cada cliente del almacén.</p>
        </div>
      </header>
      <div className="vacio">
        <strong>Esta sección aún no está disponible</strong>
        <p>
          Aquí verás la deuda de fiado de cada cliente, podrás registrar sus abonos y ajustar su límite de crédito.
        </p>
      </div>
    </section>
  );
}
