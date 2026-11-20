// Mensaje de permisos insuficientes: se mantiene en la sección y no se exponen
// datos del módulo reservado (spec 001, RF-14).
import { useNavigate } from 'react-router-dom';

export function SinPermisos() {
  const navegar = useNavigate();

  return (
    <section className="pagina">
      <div className="vacio">
        <strong>Sin permisos</strong>
        <p>No tienes permisos para acceder a esta sección. Pídele al administrador si la necesitas.</p>
        <button type="button" className="boton" onClick={() => navegar('/ventas')}>
          Volver a ventas
        </button>
      </div>
    </section>
  );
}
