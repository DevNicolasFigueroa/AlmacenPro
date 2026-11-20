// Aviso de venta por expirar (spec 001, RF-24): se muestra a los 10 minutos de inactividad.
interface Props {
  segundosParaCancelar: number;
}

export function AvisoVentaPorExpirar({ segundosParaCancelar }: Props) {
  const minutos = Math.floor(segundosParaCancelar / 60);
  const segundos = segundosParaCancelar % 60;
  const tiempo = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;

  return (
    <div role="alert" className="aviso-venta">
      <strong>Tu venta lleva 10 minutos sin actividad.</strong>{' '}
      Se cancelará automáticamente en {tiempo}. Realiza una acción en la venta para mantenerla activa.
    </div>
  );
}
