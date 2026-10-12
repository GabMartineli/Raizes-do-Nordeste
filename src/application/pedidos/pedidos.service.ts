import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DetalheErro, NaoEncontradoError, RegraNegocioError } from '../../domain/shared/errors';
import { CanalPedido, FormaPagamento, Perfil, StatusPagamento, StatusPedido, TipoMovimentacao } from '../../domain/shared/enums';
import { ContextoRequisicao, UsuarioAutenticado } from '../../domain/shared/usuario-autenticado';
import { validarCanalParaPerfil } from '../../domain/pedido/canal-pedido.rules';
import { calcularTotais, consolidarItens, ItemSolicitado } from '../../domain/pedido/calculo-pedido';
import {
  cancelamentoExigeEstorno,
  validarCancelamento,
  validarTransicaoOperacional,
} from '../../domain/pedido/status-pedido.rules';
import { GATEWAY_PAGAMENTO, GatewayPagamento } from '../../domain/pagamento/gateway-pagamento.port';
import { PrismaService, TransacaoPrisma } from '../../infrastructure/database/prisma.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';
import { FidelidadeService } from '../fidelidade/fidelidade.service';
import { garantirAcessoAUnidade, resolverUnidadeDoFiltro } from '../shared/escopo-unidade';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

export interface DadosNovoPedido {
  canalPedido: CanalPedido;
  unidadeId: number;
  clienteId?: number;
  itens: ItemSolicitado[];
  formaPagamento: FormaPagamento;
  pontosResgate?: number;
  observacao?: string;
}

export interface FiltroPedidos extends ParametrosPaginacao {
  canalPedido?: CanalPedido;
  status?: StatusPedido;
  unidadeId?: number;
}

export const INCLUDE_PEDIDO = {
  itens: { include: { produto: { select: { id: true, nome: true } } } },
  pagamentos: { orderBy: { id: 'asc' } },
} satisfies Prisma.PedidoInclude;

export type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof INCLUDE_PEDIDO }>;

@Injectable()
export class PedidosService {
  private readonly logger = new Logger('PedidosService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly fidelidade: FidelidadeService,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
  ) {}

  async criar(dados: DadosNovoPedido, ctx: ContextoRequisicao): Promise<PedidoCompleto> {
    const ator = ctx.usuario;
    validarCanalParaPerfil(dados.canalPedido, ator.perfil);
    const clienteId = await this.resolverCliente(dados, ator);

    const unidade = await this.prisma.unidade.findUnique({ where: { id: dados.unidadeId } });
    if (!unidade || !unidade.ativa) {
      throw new NaoEncontradoError('UNIDADE_NAO_ENCONTRADA', `Unidade ${dados.unidadeId} não encontrada.`, [
        { field: 'unidadeId', issue: 'Unidade inexistente ou inativa' },
      ]);
    }
    garantirAcessoAUnidade(ator, unidade.id);

    const itens = consolidarItens(dados.itens);
    const precificados = await this.precificarItens(unidade.id, itens);
    await this.verificarEstoque(unidade.id, itens);

    const pontosResgate = dados.pontosResgate ?? 0;
    let saldoPontos = 0;
    if (pontosResgate > 0) {
      if (!clienteId || !(await this.fidelidade.possuiConsentimentoAtivo(clienteId))) {
        throw new RegraNegocioError(
          'CONSENTIMENTO_FIDELIDADE_NECESSARIO',
          'Para resgatar pontos o cliente precisa ter aderido ao programa de fidelidade.',
        );
      }
      saldoPontos = (await this.prisma.contaFidelidade.findUnique({ where: { usuarioId: clienteId } }))?.saldoPontos ?? 0;
    }
    const totais = calcularTotais(precificados, pontosResgate, saldoPontos);

    const pedidoId = await this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: {
          clienteId,
          operadorId: ator.perfil === Perfil.CLIENTE ? null : ator.id,
          unidadeId: unidade.id,
          canalPedido: dados.canalPedido,
          formaPagamento: dados.formaPagamento,
          subtotalCentavos: totais.subtotalCentavos,
          descontoCentavos: totais.descontoCentavos,
          totalCentavos: totais.totalCentavos,
          pontosResgatados: totais.pontosResgatados,
          observacao: dados.observacao,
          itens: {
            create: totais.itens.map((i) => ({
              produtoId: i.produtoId,
              quantidade: i.quantidade,
              precoUnitarioCentavos: i.precoUnitarioCentavos,
              subtotalCentavos: i.subtotalCentavos,
            })),
          },
        },
      });
      await this.reservarEstoque(tx, unidade.id, pedido.id, itens, ator.id);
      if (clienteId && totais.pontosResgatados > 0) {
        await this.fidelidade.debitarResgate(tx, clienteId, pedido.id, totais.pontosResgatados);
      }
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PEDIDO_CRIADO,
          entidade: 'Pedido',
          entidadeId: pedido.id,
          detalhes: {
            canalPedido: pedido.canalPedido,
            unidadeId: pedido.unidadeId,
            totalCentavos: pedido.totalCentavos,
            itens: itens.length,
          },
        },
        ctx,
        tx,
      );
      return pedido.id;
    });

    return this.carregar(pedidoId);
  }

  async listar(filtro: FiltroPedidos, ctx: ContextoRequisicao) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const ator = ctx.usuario;
    const where: Prisma.PedidoWhereInput = {
      canalPedido: filtro.canalPedido,
      status: filtro.status,
      unidadeId: ator.perfil === Perfil.CLIENTE ? filtro.unidadeId : resolverUnidadeDoFiltro(ator, filtro.unidadeId),
      clienteId: ator.perfil === Perfil.CLIENTE ? ator.id : undefined,
    };
    const [pedidos, total] = await Promise.all([
      this.prisma.pedido.findMany({ where, include: INCLUDE_PEDIDO, orderBy: { id: 'desc' }, skip, take: limit }),
      this.prisma.pedido.count({ where }),
    ]);
    return montarPagina(pedidos, total, page, limit);
  }

  async obter(id: number, ctx: ContextoRequisicao): Promise<PedidoCompleto> {
    const pedido = await this.carregar(id);
    this.garantirAcessoAoPedido(pedido, ctx.usuario);
    return pedido;
  }

  async resumoPorCanal(filtro: { unidadeId?: number }, ctx: ContextoRequisicao) {
    const unidadeId = resolverUnidadeDoFiltro(ctx.usuario, filtro.unidadeId);
    const grupos = await this.prisma.pedido.groupBy({
      by: ['canalPedido', 'status'],
      where: { unidadeId },
      _count: { _all: true },
      _sum: { totalCentavos: true },
    });
    return { unidadeId: unidadeId ?? null, grupos };
  }

  async atualizarStatus(id: number, novoStatus: StatusPedido, ctx: ContextoRequisicao): Promise<PedidoCompleto> {
    const pedido = await this.carregar(id);
    this.garantirAcessoAoPedido(pedido, ctx.usuario);
    validarTransicaoOperacional(pedido.status, novoStatus, ctx.usuario.perfil);

    await this.prisma.$transaction(async (tx) => {
      await this.trocarStatus(tx, pedido.id, pedido.status, novoStatus);
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PEDIDO_STATUS_ALTERADO,
          entidade: 'Pedido',
          entidadeId: pedido.id,
          detalhes: { de: pedido.status, para: novoStatus },
        },
        ctx,
        tx,
      );
    });
    return this.carregar(id);
  }

  async cancelar(id: number, motivo: string, ctx: ContextoRequisicao): Promise<PedidoCompleto> {
    const pedido = await this.carregar(id);
    this.garantirAcessoAoPedido(pedido, ctx.usuario);
    validarCancelamento(pedido.status, ctx.usuario.perfil);

    const pagamentoAprovado = pedido.pagamentos.find((p) => p.status === StatusPagamento.APROVADO);
    if (cancelamentoExigeEstorno(pedido.status) && pagamentoAprovado?.transacaoExterna) {
      await this.gateway.estornar(pagamentoAprovado.transacaoExterna, pagamentoAprovado.valorCentavos);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.trocarStatus(tx, pedido.id, pedido.status, StatusPedido.CANCELADO, { motivoCancelamento: motivo });
      if (pagamentoAprovado && cancelamentoExigeEstorno(pedido.status)) {
        await tx.pagamento.update({ where: { id: pagamentoAprovado.id }, data: { status: StatusPagamento.ESTORNADO } });
        await this.auditoria.registrar(
          { acao: AcaoAuditoria.PAGAMENTO_ESTORNADO, entidade: 'Pagamento', entidadeId: pagamentoAprovado.id },
          ctx,
          tx,
        );
      }
      await this.devolverEstoque(tx, pedido, ctx.usuario.id);
      if (pedido.clienteId) await this.fidelidade.estornarPorCancelamento(tx, pedido.clienteId, pedido.id);
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PEDIDO_CANCELADO,
          entidade: 'Pedido',
          entidadeId: pedido.id,
          detalhes: { statusAnterior: pedido.status, motivo, estorno: !!pagamentoAprovado },
        },
        ctx,
        tx,
      );
    });
    return this.carregar(id);
  }

  async carregar(id: number): Promise<PedidoCompleto> {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: INCLUDE_PEDIDO });
    if (!pedido) throw new NaoEncontradoError('PEDIDO_NAO_ENCONTRADO', `Pedido ${id} não encontrado.`);
    return pedido;
  }

  garantirAcessoAoPedido(pedido: { id: number; clienteId: number | null; unidadeId: number }, usuario: UsuarioAutenticado): void {
    if (usuario.perfil === Perfil.CLIENTE) {
      if (pedido.clienteId !== usuario.id) {
        throw new NaoEncontradoError('PEDIDO_NAO_ENCONTRADO', `Pedido ${pedido.id} não encontrado.`);
      }
      return;
    }
    garantirAcessoAUnidade(usuario, pedido.unidadeId);
  }

  // where com o status antigo: se outra requisicao mudou antes, nao atualiza
  async trocarStatus(
    tx: TransacaoPrisma,
    pedidoId: number,
    de: StatusPedido,
    para: StatusPedido,
    extras: Prisma.PedidoUpdateManyMutationInput = {},
  ): Promise<void> {
    const resultado = await tx.pedido.updateMany({ where: { id: pedidoId, status: de }, data: { status: para, ...extras } });
    if (resultado.count === 0) {
      throw new RegraNegocioError('PEDIDO_ALTERADO_CONCORRENTEMENTE', 'O pedido foi alterado por outra operação. Consulte-o novamente.');
    }
  }

  private async resolverCliente(dados: DadosNovoPedido, ator: UsuarioAutenticado): Promise<number | null> {
    if (ator.perfil === Perfil.CLIENTE) return ator.id; // o cliente sempre compra para si
    if (!dados.clienteId) return null; // balcão sem identificação do cliente
    const cliente = await this.prisma.usuario.findUnique({ where: { id: dados.clienteId } });
    if (!cliente || cliente.perfil !== Perfil.CLIENTE || !cliente.ativo) {
      throw new NaoEncontradoError('CLIENTE_NAO_ENCONTRADO', `Cliente ${dados.clienteId} não encontrado.`, [
        { field: 'clienteId', issue: 'Cliente inexistente ou inativo' },
      ]);
    }
    return cliente.id;
  }

  private async precificarItens(unidadeId: number, itens: ItemSolicitado[]) {
    const cardapio = await this.prisma.cardapioItem.findMany({
      where: { unidadeId, produtoId: { in: itens.map((i) => i.produtoId) }, disponivel: true, produto: { ativo: true } },
    });
    const precoPorProduto = new Map(cardapio.map((c) => [c.produtoId, c.precoCentavos]));
    const ausentes: DetalheErro[] = [];
    itens.forEach((item, indice) => {
      if (!precoPorProduto.has(item.produtoId)) {
        ausentes.push({ field: `itens[${indice}].produtoId`, issue: `Produto ${item.produtoId} não está disponível no cardápio da unidade` });
      }
    });
    if (ausentes.length) {
      throw new NaoEncontradoError('PRODUTO_NAO_ENCONTRADO', 'Um ou mais produtos não existem no cardápio desta unidade.', ausentes);
    }
    return itens.map((item) => ({ ...item, precoUnitarioCentavos: precoPorProduto.get(item.produtoId)! }));
  }

  private async verificarEstoque(unidadeId: number, itens: ItemSolicitado[]): Promise<void> {
    const estoques = await this.prisma.estoque.findMany({
      where: { unidadeId, produtoId: { in: itens.map((i) => i.produtoId) } },
    });
    const saldo = new Map(estoques.map((e) => [e.produtoId, e.quantidade]));
    const insuficientes: DetalheErro[] = [];
    itens.forEach((item, indice) => {
      const disponivel = saldo.get(item.produtoId) ?? 0;
      if (disponivel < item.quantidade) {
        insuficientes.push({ field: `itens[${indice}].quantidade`, issue: `Produto ${item.produtoId} - disponível: ${disponivel}` });
      }
    });
    if (insuficientes.length) {
      throw new RegraNegocioError('ESTOQUE_INSUFICIENTE', 'Não há quantidade suficiente para um ou mais itens.', insuficientes);
    }
  }

  private async reservarEstoque(tx: TransacaoPrisma, unidadeId: number, pedidoId: number, itens: ItemSolicitado[], usuarioId: number) {
    for (const item of itens) {
      const estoque = await tx.estoque.findUnique({ where: { unidadeId_produtoId: { unidadeId, produtoId: item.produtoId } } });
      // so baixa se ainda tiver saldo, evita estoque negativo com dois pedidos ao mesmo tempo
      const baixa = estoque
        ? await tx.estoque.updateMany({
            where: { id: estoque.id, quantidade: { gte: item.quantidade } },
            data: { quantidade: { decrement: item.quantidade } },
          })
        : { count: 0 };
      if (!estoque || baixa.count === 0) {
        throw new RegraNegocioError('ESTOQUE_INSUFICIENTE', 'Não há quantidade suficiente para um ou mais itens.', [
          { field: 'itens', issue: `Produto ${item.produtoId} esgotou durante o processamento` },
        ]);
      }
      await tx.movimentacaoEstoque.create({
        data: { estoqueId: estoque.id, tipo: TipoMovimentacao.SAIDA, quantidade: item.quantidade, motivo: 'RESERVA_PEDIDO', pedidoId, usuarioId },
      });
    }
  }

  private async devolverEstoque(tx: TransacaoPrisma, pedido: PedidoCompleto, usuarioId: number) {
    for (const item of pedido.itens) {
      const estoque = await tx.estoque.update({
        where: { unidadeId_produtoId: { unidadeId: pedido.unidadeId, produtoId: item.produtoId } },
        data: { quantidade: { increment: item.quantidade } },
      });
      await tx.movimentacaoEstoque.create({
        data: {
          estoqueId: estoque.id,
          tipo: TipoMovimentacao.ENTRADA,
          quantidade: item.quantidade,
          motivo: 'CANCELAMENTO_PEDIDO',
          pedidoId: pedido.id,
          usuarioId,
        },
      });
    }
    this.logger.log(`Estoque do pedido #${pedido.id} devolvido à unidade ${pedido.unidadeId}`);
  }
}
