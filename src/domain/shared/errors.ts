export type TipoErro =
  | 'NAO_ENCONTRADO'
  | 'REGRA_NEGOCIO'
  | 'ACESSO_NEGADO'
  | 'NAO_AUTENTICADO'
  | 'VALIDACAO'
  | 'INTEGRACAO_EXTERNA';

export interface DetalheErro {
  field?: string;
  issue: string;
}

export class DomainError extends Error {
  constructor(
    readonly tipo: TipoErro,
    readonly codigo: string,
    message: string,
    readonly detalhes: DetalheErro[] = [],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NaoEncontradoError extends DomainError {
  constructor(codigo: string, message: string, detalhes: DetalheErro[] = []) {
    super('NAO_ENCONTRADO', codigo, message, detalhes);
  }
}

export class RegraNegocioError extends DomainError {
  constructor(codigo: string, message: string, detalhes: DetalheErro[] = []) {
    super('REGRA_NEGOCIO', codigo, message, detalhes);
  }
}

export class AcessoNegadoError extends DomainError {
  constructor(message = 'Você não tem permissão para executar esta ação.', codigo = 'ACESSO_NEGADO') {
    super('ACESSO_NEGADO', codigo, message);
  }
}

export class NaoAutenticadoError extends DomainError {
  constructor(codigo: string, message: string) {
    super('NAO_AUTENTICADO', codigo, message);
  }
}

export class ValidacaoError extends DomainError {
  constructor(codigo: string, message: string, detalhes: DetalheErro[] = []) {
    super('VALIDACAO', codigo, message, detalhes);
  }
}

export class IntegracaoExternaError extends DomainError {
  constructor(codigo: string, message: string, detalhes: DetalheErro[] = []) {
    super('INTEGRACAO_EXTERNA', codigo, message, detalhes);
  }
}
