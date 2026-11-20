// Mensaje de permisos insuficientes: se mantiene en la sección y no se exponen
// datos del módulo reservado (spec 001, RF-14).
import { useNavigate } from 'react-router-dom';

export function SinPermisos() {
  const navegar = useNavigate();

  return (
    <section>
      <h2>Sin permisos</h2>
      <p>No tienes permisos para acceder a esta sección.</p>
      <button type="button" onClick={() => navegar('/ventas')}>
        Volver a ventas
      </button>
    </section>
  );
}
