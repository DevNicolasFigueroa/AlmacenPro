// Cuenta de un cliente en su propia dirección (/clientes/:id): la ven el cajero y el administrador
// (spec 004, RF-7). El contenido vive en CuentaCliente para reutilizarlo desde la pantalla de venta.
import { Link, useParams } from 'react-router-dom';
import { CuentaCliente } from '../components/CuentaCliente';
import '../styles/clientes.css';

export function VistaCuentaCliente() {
  const { id } = useParams();
  const clienteId = Number(id);

  return (
    <section className="pagina">
      <header className="pagina-cabecera">
        <div>
          <Link to="/clientes" className="volver">← Clientes</Link>
          <h2 className="pagina-titulo">Cuenta del cliente</h2>
        </div>
      </header>

      {Number.isInteger(clienteId) && clienteId > 0
        ? <CuentaCliente clienteId={clienteId} />
        : <p role="alert" className="alerta alerta--error">No se encontró el cliente</p>}
    </section>
  );
}
