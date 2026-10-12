import { Injectable } from '@nestjs/common';
import { NaoEncontradoError } from '../../domain/shared/errors';
import { reaisParaCentavos } from '../../domain/shared/dinheiro';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';
import { garantirAcessoAUnidade } from '../shared/escopo-unidade';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

export interface DadosUnidade {
  nome: string;
  tipo: 'MATRIZ' | 'FILIAL';
  cidade: string;
  uf: string;
  endereco: string;
}

export interface DadosItemCardapio {
  preco: number;
  disponivel?: boolean;
}

@Injectable()
export class UnidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(filtro: ParametrosPaginacao & { uf?: string }) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const where = { ativa: true, uf: filtro.uf?.toUpperCase() };
    const [unidades, total] = await Promise.all([
      this.prisma.unidade.findMany({ where, orderBy: { id: 'asc' }, skip, take: limit }),
      this.prisma.unidade.count({ where }),
    ]);
    return montarPagina(unidades, total, page, limit);
  }

  async obter(id: number) {
    const unidade = await this.prisma.unidade.findUnique({ where: { id } });
    if (!unidade) throw new NaoEncontradoError('UNIDADE_NAO_ENCONTRADA', `Unidade ${id} não encontrada.`);
    return unidade;
  }

  criar(dados: DadosUnidade) {
    return this.prisma.unidade.create({ data: { ...dados, uf: dados.uf.toUpperCase() } });
  }

  async cardapio(unidadeId: number, filtro: { categoria?: string; somenteDisponiveis?: boolean }) {
    await this.obter(unidadeId);
    const itens = await this.prisma.cardapioItem.findMany({
      where: { unidadeId, produto: { ativo: true, categoria: filtro.categoria } },
      include: { produto: true },
      orderBy: [{ produto: { categoria: 'asc' } }, { produto: { nome: 'asc' } }],
    });
    const estoques = await this.prisma.estoque.findMany({ where: { unidadeId } });
    const saldo = new Map(estoques.map((e) => [e.produtoId, e.quantidade]));

    const resultado = itens.map((item) => {
      const quantidade = saldo.get(item.produtoId) ?? 0;
      return { item, quantidadeEmEstoque: quantidade, disponivel: item.disponivel && quantidade > 0 };
    });
    return filtro.somenteDisponiveis ? resultado.filter((r) => r.disponivel) : resultado;
  }

  async definirItemCardapio(unidadeId: number, produtoId: number, dados: DadosItemCardapio, ctx: ContextoRequisicao) {
    garantirAcessoAUnidade(ctx.usuario, unidadeId);
    await this.obter(unidadeId);
    const produto = await this.prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) throw new NaoEncontradoError('PRODUTO_NAO_ENCONTRADO', `Produto ${produtoId} não encontrado.`);

    const precoCentavos = reaisParaCentavos(dados.preco);
    const item = await this.prisma.cardapioItem.upsert({
      where: { unidadeId_produtoId: { unidadeId, produtoId } },
      create: { unidadeId, produtoId, precoCentavos, disponivel: dados.disponivel ?? true },
      update: { precoCentavos, disponivel: dados.disponivel },
      include: { produto: true },
    });
    await this.auditoria.registrar(
      {
        acao: AcaoAuditoria.CARDAPIO_ATUALIZADO,
        entidade: 'CardapioItem',
        entidadeId: item.id,
        detalhes: { unidadeId, produtoId, precoCentavos, disponivel: item.disponivel },
      },
      ctx,
    );
    const estoque = await this.prisma.estoque.findUnique({ where: { unidadeId_produtoId: { unidadeId, produtoId } } });
    const quantidade = estoque?.quantidade ?? 0;
    return { item, quantidadeEmEstoque: quantidade, disponivel: item.disponivel && quantidade > 0 };
  }
}
