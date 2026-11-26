// Cuenta del cliente sobre la pantalla de venta (spec 004, RF-8): se abre desde la tarjeta del cliente
// que se está atendiendo, sin salir de la venta ni perder el carrito. Permite ver sus compras y
// movimientos, registrar un abono y corregir sus datos; al cambiar algo avisa para que la tarjeta de
// la venta muestre el saldo y el RUT al día.
import { CuentaCliente } from './CuentaCliente';
import { Modal } from './Modal';
import type { ClienteCuenta } from '../types';

interface Props {
  clienteId: number;
  onClienteActualizado: (cliente: ClienteCuenta) => void;
  onCerrar: () => void;
}

export function CuentaClienteModal({ clienteId, onClienteActualizado, onCerrar }: Props) {
  return (
    <Modal titulo="Cuenta del cliente" idTitulo="titulo-cuenta-cliente" ancha
      subtitulo="Tu venta sigue abierta: el carrito no cambia" onCerrar={onCerrar}>
      <CuentaCliente clienteId={clienteId} onClienteActualizado={onClienteActualizado} />
      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={onCerrar}>
          Volver a la venta
        </button>
      </div>
    </Modal>
  );
}
