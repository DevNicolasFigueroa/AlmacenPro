import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ProveedorAutenticacion } from './context/AutenticacionContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorAutenticacion>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ProveedorAutenticacion>
  </StrictMode>
);
