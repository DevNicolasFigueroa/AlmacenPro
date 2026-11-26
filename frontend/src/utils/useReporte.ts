// Carga un reporte del servidor cada vez que cambia el período, sin que una respuesta vieja pise a una
// nueva. Si "ruta" es null no consulta (por ejemplo, con un período inválido).
import { useEffect, useRef, useState } from 'react';
import { api, mensajeError } from '../services/api';

export function useReporte<T>(ruta: string | null, parametros?: Record<string, string | number | undefined>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const ultimaConsulta = useRef(0);
  const clave = JSON.stringify(parametros ?? {});

  useEffect(() => {
    if (ruta === null) return undefined;
    const consulta = ultimaConsulta.current + 1;
    ultimaConsulta.current = consulta;
    setCargando(true);
    setError('');
    api.get<T>(ruta, { params: parametros })
      .then(({ data }) => { if (consulta === ultimaConsulta.current) setDatos(data); })
      .catch((err) => { if (consulta === ultimaConsulta.current) setError(mensajeError(err)); })
      .finally(() => { if (consulta === ultimaConsulta.current) setCargando(false); });
    return () => { ultimaConsulta.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta, clave]);

  return { datos, error, cargando };
}
