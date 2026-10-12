import { FormaPagamento } from '../shared/enums';

export const GATEWAY_PAGAMENTO = Symbol('GATEWAY_PAGAMENTO');

export const CenarioMock = {
  APROVAR: 'APROVAR',
  RECUSAR: 'RECUSAR',
  FALHA_COMUNICACAO: 'FALHA_COMUNICACAO',
} as const;
export type CenarioMock = (typeof CenarioMock)[keyof typeof CenarioMock];

export interface SolicitacaoPagamento {
  referencia: string;
  valorCentavos: number;
  forma: FormaPagamento;
  idempotencyKey: string;
  cenario?: CenarioMock;
}

export interface RespostaGateway {
  transacaoId: string;
  status: 'APROVADO' | 'RECUSADO';
  motivo?: string;
  processadoEm: string;
}

export interface GatewayPagamento {
  cobrar(solicitacao: SolicitacaoPagamento): Promise<RespostaGateway>;
  estornar(transacaoId: string, valorCentavos: number): Promise<{ estornoId: string }>;
}
