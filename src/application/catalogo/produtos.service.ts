import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NaoEncontradoError } from '../../domain/shared/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

export interface DadosProduto {
  nome: string;
  descricao?: string;
  categoria: string;
  ativo?: boolean;
}

export interface FiltroProdutos extends ParametrosPaginacao {
  categoria?: string;
  busca?: string;
}

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroProdutos) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const where: Prisma.ProdutoWhereInput = {
      ativo: true,
      categoria: filtro.categoria,
      nome: filtro.busca ? { contains: filtro.busca } : undefined,
    };
    const [produtos, total] = await Promise.all([
      this.prisma.produto.findMany({ where, orderBy: { nome: 'asc' }, skip, take: limit }),
      this.prisma.produto.count({ where }),
    ]);
    return montarPagina(produtos, total, page, limit);
  }

  async obter(id: number) {
    const produto = await this.prisma.produto.findUnique({ where: { id } });
    if (!produto) throw new NaoEncontradoError('PRODUTO_NAO_ENCONTRADO', `Produto ${id} não encontrado.`);
    return produto;
  }

  criar(dados: DadosProduto) {
    return this.prisma.produto.create({ data: dados });
  }

  async atualizar(id: number, dados: Partial<DadosProduto>) {
    await this.obter(id);
    return this.prisma.produto.update({ where: { id }, data: dados });
  }
}
