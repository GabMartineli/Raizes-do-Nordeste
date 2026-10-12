export const Perfil = {
  CLIENTE: 'CLIENTE',
  ATENDENTE: 'ATENDENTE',
  COZINHA: 'COZINHA',
  GERENTE: 'GERENTE',
  ADMIN: 'ADMIN',
} as const;
export type Perfil = (typeof Perfil)[keyof typeof Perfil];

export const PERFIS_FUNCIONARIO: readonly Perfil[] = [
  Perfil.ATENDENTE,
  Perfil.COZINHA,
  Perfil.GERENTE,
  Perfil.ADMIN,
];

export const CanalPedido = {
  APP: 'APP',
  TOTEM: 'TOTEM',
  BALCAO: 'BALCAO',
  PICKUP: 'PICKUP',
  WEB: 'WEB',
} as const;
export type CanalPedido = (typeof CanalPedido)[keyof typeof CanalPedido];

export const StatusPedido = {
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
  PAGAMENTO_RECUSADO: 'PAGAMENTO_RECUSADO',
  PAGO: 'PAGO',
  EM_PREPARO: 'EM_PREPARO',
  PRONTO: 'PRONTO',
  ENTREGUE: 'ENTREGUE',
  CANCELADO: 'CANCELADO',
} as const;
export type StatusPedido = (typeof StatusPedido)[keyof typeof StatusPedido];

export const FormaPagamento = {
  PIX: 'PIX',
  CARTAO_CREDITO: 'CARTAO_CREDITO',
  CARTAO_DEBITO: 'CARTAO_DEBITO',
  MOCK: 'MOCK',
} as const;
export type FormaPagamento = (typeof FormaPagamento)[keyof typeof FormaPagamento];

export const StatusPagamento = {
  APROVADO: 'APROVADO',
  RECUSADO: 'RECUSADO',
  ERRO: 'ERRO',
  ESTORNADO: 'ESTORNADO',
} as const;
export type StatusPagamento = (typeof StatusPagamento)[keyof typeof StatusPagamento];

export const TipoMovimentacao = {
  ENTRADA: 'ENTRADA',
  SAIDA: 'SAIDA',
} as const;
export type TipoMovimentacao = (typeof TipoMovimentacao)[keyof typeof TipoMovimentacao];

export const FinalidadeConsentimento = {
  FIDELIDADE: 'FIDELIDADE',
  MARKETING: 'MARKETING',
} as const;
export type FinalidadeConsentimento =
  (typeof FinalidadeConsentimento)[keyof typeof FinalidadeConsentimento];
