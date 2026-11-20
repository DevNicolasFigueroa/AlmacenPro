// Cliente HTTP central: todas las llamadas a la API pasan por aquí.
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api', // Vite la redirige al backend en desarrollo
});

// Adjunta automáticamente el token JWT a cada petición.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('almacenpro_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Una sesión terminada (cierre, desactivación, expiración o venta cancelada)
// limpia los datos locales y vuelve al ingreso con el motivo en español.
// Las pantallas públicas muestran su propio error sin redirigir.
api.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    const ruta = window.location.pathname;
    const esPublica = ruta === '/login' || ruta === '/recuperar-contrasena';
    if (error.response?.status === 401 && !esPublica) {
      localStorage.removeItem('almacenpro_token');
      localStorage.removeItem('almacenpro_usuario');
      sessionStorage.setItem('almacenpro_aviso', error.response?.data?.mensaje ?? 'Inicia sesión nuevamente');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Traduce los errores del backend a mensajes amigables en español.
export function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.mensaje ?? 'Ocurrió un error inesperado, intenta nuevamente';
  }
  return 'Ocurrió un error inesperado, intenta nuevamente';
}
