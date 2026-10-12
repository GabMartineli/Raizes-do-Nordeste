import { AcessoNegadoError, RegraNegocioError } from '../shared/errors';
import { Perfil, StatusPedido } from '../shared/enums';

// fluxo: PAGO -> EM_PREPARO -> PRONTO -> ENTREGUE
const TRANSICOES_OPERACIONAIS: Partial<Record<StatusPedido, { para: StatusPedido; perfis: Perfil[] }>> = {
  [StatusPedido.PAGO]: {
    para: StatusPedido.EM_PREPARO,
    perfis: [Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN],
  },
  [StatusPedido.EM_PREPARO]: {
    para: StatusPedido.PRONTO,
    perfis: [Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN],
  },
  [StatusPedido.PRONTO]: {
    para: StatusPedido.ENTREGUE,
    perfis: [Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN],
  },
};

export const STATUS_OPERACIONAIS = [StatusPedido.EM_PREPARO, StatusPedido.PRONTO, StatusPedido.ENTREGUE] as const;

export function validarTransicaoOperacional(atual: StatusPedido, novo: StatusPedido, perfil: Perfil): void {
  const transicao = TRANSICOES_OPERACIONAIS[atual];
  if (!transicao || transicao.para !== novo) {
    const esperado = transicao ? ` Próximo status permitido: ${transicao.para}.` : '';
    throw new RegraNegocioError(
      'TRANSICAO_STATUS_INVALIDA',
      `Não é possível alterar o pedido de ${atual} para ${novo}.${esperado}`,
      [{ field: 'status', issue: `Status atual: ${atual}` }],
    );
  }
  if (!transicao.perfis.includes(perfil)) {
    throw new AcessoNegadoError(`O perfil ${perfil} não pode mover o pedido para ${novo}.`);
  }
}

const CANCELAMENTO_POR_PERFIL: Record<Perfil, StatusPedido[]> = {
  [Perfil.CLIENTE]: [StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PAGAMENTO_RECUSADO],
  [Perfil.ATENDENTE]: [StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PAGAMENTO_RECUSADO, StatusPedido.PAGO],
  [Perfil.COZINHA]: [],
  [Perfil.GERENTE]: [
    StatusPedido.AGUARDANDO_PAGAMENTO,
    StatusPedido.PAGAMENTO_RECUSADO,
    StatusPedido.PAGO,
    StatusPedido.EM_PREPARO,
  ],
  [Perfil.ADMIN]: [
    StatusPedido.AGUARDANDO_PAGAMENTO,
    StatusPedido.PAGAMENTO_RECUSADO,
    StatusPedido.PAGO,
    StatusPedido.EM_PREPARO,
  ],
};

export function validarCancelamento(atual: StatusPedido, perfil: Perfil): void {
  if (atual === StatusPedido.CANCELADO) {
    throw new RegraNegocioError('PEDIDO_JA_CANCELADO', 'O pedido já está cancelado.');
  }
  if (perfil === Perfil.COZINHA) {
    throw new AcessoNegadoError('A cozinha não pode cancelar pedidos.');
  }
  if (!CANCELAMENTO_POR_PERFIL[perfil].includes(atual)) {
    throw new RegraNegocioError(
      'CANCELAMENTO_NAO_PERMITIDO',
      `Pedido com status ${atual} não pode ser cancelado pelo perfil ${perfil}.`,
      [{ field: 'status', issue: `Status atual: ${atual}` }],
    );
  }
}

export function cancelamentoExigeEstorno(atual: StatusPedido): boolean {
  return atual === StatusPedido.PAGO || atual === StatusPedido.EM_PREPARO;
}

export function validarPedidoPagavel(atual: StatusPedido): void {
  if (atual === StatusPedido.AGUARDANDO_PAGAMENTO || atual === StatusPedido.PAGAMENTO_RECUSADO) return;
  if (atual === StatusPedido.CANCELADO) {
    throw new RegraNegocioError('PEDIDO_CANCELADO', 'Não é possível pagar um pedido cancelado.');
  }
  throw new RegraNegocioError('PEDIDO_JA_PAGO', `O pedido já foi pago (status atual: ${atual}).`);
}
