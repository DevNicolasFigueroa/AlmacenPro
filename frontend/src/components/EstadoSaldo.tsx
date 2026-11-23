// Estado de la cuenta de un cliente según el signo de su saldo (spec 004, RF-5): en deuda, al día
// o con saldo a favor. Lo usan el listado y la cuenta; la deuda se destaca con su monto.
import { formatearClp } from '../utils/formato';
import type { EstadoCuenta } from '../types';

interface Props {
  estado: EstadoCuenta;
  saldo: number; // positivo = deuda; negativo = saldo a favor
}

export function EstadoSaldo({ estado, saldo }: Props) {
  if (estado === 'deuda') {
    return <span className="chip chip--alerta">Debe {formatearClp(saldo)}</span>;
  }
  if (estado === 'a_favor') {
    return <span className="chip">A favor {formatearClp(-saldo)}</span>;
  }
  return <span className="chip chip--apagado">Al día</span>;
}
