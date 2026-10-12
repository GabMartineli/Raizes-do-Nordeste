import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { PrismaService, TransacaoPrisma } from '../../infrastructure/database/prisma.service';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

export const AcaoAuditoria = {
  USUARIO_REGISTRADO: 'USUARIO_REGISTRADO',
  LOGIN_SUCESSO: 'LOGIN_SUCESSO',
  LOGIN_FALHA: 'LOGIN_FALHA',
  FUNCIONARIO_CRIADO: 'FUNCIONARIO_CRIADO',
  ACESSO_DADOS_PESSOAIS: 'ACESSO_DADOS_PESSOAIS',
  DADOS_PESSOAIS_ATUALIZADOS: 'DADOS_PESSOAIS_ATUALIZADOS',
  USUARIO_ANONIMIZADO: 'USUARIO_ANONIMIZADO',
  CONSENTIMENTO_CONCEDIDO: 'CONSENTIMENTO_CONCEDIDO',
  CONSENTIMENTO_REVOGADO: 'CONSENTIMENTO_REVOGADO',
  PEDIDO_CRIADO: 'PEDIDO_CRIADO',
  PEDIDO_STATUS_ALTERADO: 'PEDIDO_STATUS_ALTERADO',
  PEDIDO_CANCELADO: 'PEDIDO_CANCELADO',
  PAGAMENTO_APROVADO: 'PAGAMENTO_APROVADO',
  PAGAMENTO_RECUSADO: 'PAGAMENTO_RECUSADO',
  PAGAMENTO_FALHA_INTEGRACAO: 'PAGAMENTO_FALHA_INTEGRACAO',
  PAGAMENTO_ESTORNADO: 'PAGAMENTO_ESTORNADO',
  ESTOQUE_MOVIMENTADO: 'ESTOQUE_MOVIMENTADO',
  CARDAPIO_ATUALIZADO: 'CARDAPIO_ATUALIZADO',
} as const;
export type AcaoAuditoria = (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria];

export interface RegistroAuditoria {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: string | number;
  detalhes?: Record<string, unknown>;
}

export interface FiltroAuditoria extends ParametrosPaginacao {
  acao?: string;
  entidade?: string;
  entidadeId?: string;
  usuarioId?: number;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger('Auditoria');

  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    registro: RegistroAuditoria,
    contexto: Partial<ContextoRequisicao> & { usuarioId?: number },
    tx: TransacaoPrisma = this.prisma,
  ): Promise<void> {
    const usuarioId = contexto.usuario?.id ?? contexto.usuarioId ?? null;
    await tx.auditLog.create({
      data: {
        acao: registro.acao,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId !== undefined ? String(registro.entidadeId) : null,
        detalhes: registro.detalhes ? JSON.stringify(registro.detalhes) : null,
        usuarioId,
        ip: contexto.ip ?? null,
        requestId: contexto.requestId ?? null,
      },
    });
    this.logger.log(
      `${registro.acao} ${registro.entidade}#${registro.entidadeId ?? '-'} usuario=${usuarioId ?? 'anonimo'} req=${contexto.requestId ?? '-'}`,
    );
  }

  async listar(filtro: FiltroAuditoria) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const where: Prisma.AuditLogWhereInput = {
      acao: filtro.acao,
      entidade: filtro.entidade,
      entidadeId: filtro.entidadeId,
      usuarioId: filtro.usuarioId,
    };
    const [itens, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return montarPagina(itens, total, page, limit);
  }
}
