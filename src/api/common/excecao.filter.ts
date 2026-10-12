import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { DetalheErro, DomainError, TipoErro } from '../../domain/shared/errors';

const STATUS_POR_TIPO: Record<TipoErro, number> = {
  NAO_ENCONTRADO: HttpStatus.NOT_FOUND,
  REGRA_NEGOCIO: HttpStatus.CONFLICT,
  ACESSO_NEGADO: HttpStatus.FORBIDDEN,
  NAO_AUTENTICADO: HttpStatus.UNAUTHORIZED,
  VALIDACAO: HttpStatus.UNPROCESSABLE_ENTITY,
  INTEGRACAO_EXTERNA: HttpStatus.SERVICE_UNAVAILABLE,
};

const CODIGO_POR_STATUS_HTTP: Record<number, string> = {
  400: 'REQUISICAO_INVALIDA',
  401: 'NAO_AUTENTICADO',
  403: 'ACESSO_NEGADO',
  404: 'RECURSO_NAO_ENCONTRADO',
  405: 'METODO_NAO_PERMITIDO',
  409: 'CONFLITO',
  413: 'PAYLOAD_MUITO_GRANDE',
  422: 'VALIDACAO',
  429: 'MUITAS_REQUISICOES',
};

interface CorpoErro {
  status: number;
  error: string;
  message: string;
  details: DetalheErro[];
}

@Catch()
export class ExcecaoFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExcecaoFilter');

  catch(excecao: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();

    const corpo = this.traduzir(excecao, req);
    res.status(corpo.status).json({
      error: corpo.error,
      message: corpo.message,
      details: corpo.details,
      timestamp: new Date().toISOString(),
      path: req.originalUrl ?? req.url,
      requestId: req.requestId,
    });
  }

  private traduzir(excecao: unknown, req: Request & { requestId?: string }): CorpoErro {
    if (excecao instanceof DomainError) {
      return { status: STATUS_POR_TIPO[excecao.tipo], error: excecao.codigo, message: excecao.message, details: excecao.detalhes };
    }

    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const resposta = excecao.getResponse();
      const mensagem =
        status === 404 && excecao.constructor.name === 'NotFoundException'
          ? `Rota ${req.method} ${req.originalUrl ?? req.url} não existe.`
          : typeof resposta === 'string'
            ? resposta
            : this.mensagemDe(resposta) ?? excecao.message;
      return { status, error: CODIGO_POR_STATUS_HTTP[status] ?? 'ERRO_HTTP', message: mensagem, details: [] };
    }

    const erroCorpo = excecao as { type?: string; status?: number };
    if (erroCorpo?.type === 'entity.parse.failed') {
      return { status: 400, error: 'JSON_INVALIDO', message: 'O corpo da requisição não é um JSON válido.', details: [] };
    }
    if (typeof erroCorpo?.status === 'number' && erroCorpo.status >= 400 && erroCorpo.status < 500) {
      const status = erroCorpo.status;
      return { status, error: CODIGO_POR_STATUS_HTTP[status] ?? 'REQUISICAO_INVALIDA', message: 'Requisição inválida.', details: [] };
    }

    if (excecao instanceof Prisma.PrismaClientKnownRequestError) {
      if (excecao.code === 'P2002') {
        return { status: 409, error: 'REGISTRO_DUPLICADO', message: 'Já existe um registro com estes dados.', details: [] };
      }
      if (excecao.code === 'P2025') {
        return { status: 404, error: 'RECURSO_NAO_ENCONTRADO', message: 'Registro não encontrado.', details: [] };
      }
    }

    this.logger.error(
      `Erro inesperado req=${req.requestId}: ${excecao instanceof Error ? excecao.stack : String(excecao)}`,
    );
    return { status: 500, error: 'ERRO_INTERNO', message: 'Ocorreu um erro inesperado. Tente novamente.', details: [] };
  }

  private mensagemDe(resposta: object): string | undefined {
    const message = (resposta as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    return typeof message === 'string' ? message : undefined;
  }
}
