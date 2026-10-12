import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NaoEncontradoError, RegraNegocioError } from '../../domain/shared/errors';
import { TipoMovimentacao } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';
import { garantirAcessoAUnidade, resolverUnidadeDoFiltro } from '../shared/escopo-unidade';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

export interface DadosMovimentacao {
  unidadeId: number;
  produtoId: number;
  tipo: TipoMovimentacao;
  quantidade: number;
  motivo: string;
}

export interface FiltroEstoque extends ParametrosPaginacao {
  unidadeId?: number;
  produtoId?: number;
}

@Injectable()
export class EstoqueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listarSaldos(filtro: FiltroEstoque, ctx: ContextoRequisicao) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const where: Prisma.EstoqueWhereInput = {
      unidadeId: resolverUnidadeDoFiltro(ctx.usuario, filtro.unidadeId),
      produtoId: filtro.produtoId,
    };
    const [saldos, total] = await Promise.all([
      this.prisma.estoque.findMany({
        where,
        include: { produto: true, unidade: true },
        orderBy: [{ unidadeId: 'asc' }, { produtoId: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.estoque.count({ where }),
    ]);
    return montarPagina(saldos, total, page, limit);
  }

  async movimentar(dados: DadosMovimentacao, ctx: ContextoRequisicao) {
    garantirAcessoAUnidade(ctx.usuario, dados.unidadeId);
    const [unidade, produto] = await Promise.all([
      this.prisma.unidade.findUnique({ where: { id: dados.unidadeId } }),
      this.prisma.produto.findUnique({ where: { id: dados.produtoId } }),
    ]);
    if (!unidade) throw new NaoEncontradoError('UNIDADE_NAO_ENCONTRADA', `Unidade ${dados.unidadeId} não encontrada.`);
    if (!produto) throw new NaoEncontradoError('PRODUTO_NAO_ENCONTRADO', `Produto ${dados.produtoId} não encontrado.`);

    return this.prisma.$transaction(async (tx) => {
      const chave = { unidadeId_produtoId: { unidadeId: dados.unidadeId, produtoId: dados.produtoId } };
      const estoque = await tx.estoque.upsert({
        where: chave,
        create: { unidadeId: dados.unidadeId, produtoId: dados.produtoId, quantidade: 0 },
        update: {},
      });

      if (dados.tipo === TipoMovimentacao.SAIDA) {
        const baixa = await tx.estoque.updateMany({
          where: { id: estoque.id, quantidade: { gte: dados.quantidade } },
          data: { quantidade: { decrement: dados.quantidade } },
        });
        if (baixa.count === 0) {
          throw new RegraNegocioError('ESTOQUE_INSUFICIENTE', 'Saldo insuficiente para a saída solicitada.', [
            { field: 'quantidade', issue: `Disponível: ${estoque.quantidade}` },
          ]);
        }
      } else {
        await tx.estoque.update({ where: { id: estoque.id }, data: { quantidade: { increment: dados.quantidade } } });
      }

      const movimentacao = await tx.movimentacaoEstoque.create({
        data: {
          estoqueId: estoque.id,
          tipo: dados.tipo,
          quantidade: dados.quantidade,
          motivo: dados.motivo,
          usuarioId: ctx.usuario.id,
        },
      });
      const atualizado = await tx.estoque.findUniqueOrThrow({ where: { id: estoque.id }, include: { produto: true, unidade: true } });
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.ESTOQUE_MOVIMENTADO,
          entidade: 'Estoque',
          entidadeId: estoque.id,
          detalhes: { tipo: dados.tipo, quantidade: dados.quantidade, saldoFinal: atualizado.quantidade, motivo: dados.motivo },
        },
        ctx,
        tx,
      );
      return { movimentacao, estoque: atualizado };
    });
  }

  async listarMovimentacoes(filtro: FiltroEstoque, ctx: ContextoRequisicao) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const where: Prisma.MovimentacaoEstoqueWhereInput = {
      estoque: {
        unidadeId: resolverUnidadeDoFiltro(ctx.usuario, filtro.unidadeId),
        produtoId: filtro.produtoId,
      },
    };
    const [movimentacoes, total] = await Promise.all([
      this.prisma.movimentacaoEstoque.findMany({
        where,
        include: { estoque: { include: { produto: true } } },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.movimentacaoEstoque.count({ where }),
    ]);
    return montarPagina(movimentacoes, total, page, limit);
  }
}
