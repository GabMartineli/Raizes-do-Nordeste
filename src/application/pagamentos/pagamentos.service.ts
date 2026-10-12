import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pagamento } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DomainError, IntegracaoExternaError, NaoEncontradoError, RegraNegocioError } from '../../domain/shared/errors';
import { FormaPagamento, StatusPagamento, StatusPedido } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { validarPedidoPagavel } from '../../domain/pedido/status-pedido.rules';
import {
  CenarioMock,
  GATEWAY_PAGAMENTO,
  GatewayPagamento,
  RespostaGateway,
  SolicitacaoPagamento,
} from '../../domain/pagamento/gateway-pagamento.port';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';
import { FidelidadeService } from '../fidelidade/fidelidade.service';
import { PedidosService } from '../pedidos/pedidos.service';

const TIMEOUT_GATEWAY_MS = 5_000;

export interface DadosPagamento {
  pedidoId: number;
  formaPagamento?: FormaPagamento;
  cenarioMock?: CenarioMock;
}

export interface ResultadoPagamento {
  pagamento: Pagamento;
  statusPedido: StatusPedido;
  pontosAcumulados: number;
  mensagem: string;
  reaproveitado: boolean;
}

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger('PagamentosService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
    private readonly fidelidade: FidelidadeService,
    private readonly auditoria: AuditoriaService,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
  ) {}

  async solicitar(dados: DadosPagamento, idempotencyKey: string | undefined, ctx: ContextoRequisicao): Promise<ResultadoPagamento> {
    const chave = idempotencyKey?.trim() || randomUUID();

    // mesma Idempotency-Key = devolve o pagamento que ja foi feito
    const anterior = await this.prisma.pagamento.findUnique({ where: { idempotencyKey: chave } });
    if (anterior) return this.reaproveitar(anterior, dados.pedidoId);

    const pedido = await this.pedidos.carregar(dados.pedidoId);
    this.pedidos.garantirAcessoAoPedido(pedido, ctx.usuario);
    validarPedidoPagavel(pedido.status);

    const forma = dados.formaPagamento ?? pedido.formaPagamento;
    const solicitacao: SolicitacaoPagamento = {
      referencia: `pedido-${pedido.id}`,
      valorCentavos: pedido.totalCentavos,
      forma,
      idempotencyKey: chave,
      cenario: dados.cenarioMock,
    };

    let resposta: RespostaGateway;
    try {
      resposta = await this.comTimeout(this.gateway.cobrar(solicitacao));
    } catch (erro) {
      await this.registrarFalha(pedido.id, solicitacao, erro, ctx);
      throw erro instanceof DomainError
        ? erro
        : new IntegracaoExternaError('GATEWAY_INDISPONIVEL', 'Falha de comunicação com o serviço de pagamento.');
    }

    const aprovado = resposta.status === 'APROVADO';
    const novoStatus = aprovado ? StatusPedido.PAGO : StatusPedido.PAGAMENTO_RECUSADO;

    const { pagamento, pontos } = await this.prisma.$transaction(async (tx) => {
      const pagamento = await tx.pagamento.create({
        data: {
          pedidoId: pedido.id,
          idempotencyKey: chave,
          forma,
          valorCentavos: pedido.totalCentavos,
          status: aprovado ? StatusPagamento.APROVADO : StatusPagamento.RECUSADO,
          transacaoExterna: resposta.transacaoId,
          motivo: resposta.motivo,
          payloadEnvio: JSON.stringify(solicitacao),
          payloadRetorno: JSON.stringify(resposta),
        },
      });
      if (pedido.status !== novoStatus) {
        await this.pedidos.trocarStatus(tx, pedido.id, pedido.status, novoStatus);
      }
      const pontos =
        aprovado && pedido.clienteId
          ? await this.fidelidade.acumularPorPedido(tx, pedido.clienteId, pedido.id, pedido.totalCentavos)
          : 0;
      await this.auditoria.registrar(
        {
          acao: aprovado ? AcaoAuditoria.PAGAMENTO_APROVADO : AcaoAuditoria.PAGAMENTO_RECUSADO,
          entidade: 'Pagamento',
          entidadeId: pagamento.id,
          detalhes: { pedidoId: pedido.id, valorCentavos: pedido.totalCentavos, transacao: resposta.transacaoId, motivo: resposta.motivo },
        },
        ctx,
        tx,
      );
      return { pagamento, pontos };
    });

    return {
      pagamento,
      statusPedido: novoStatus,
      pontosAcumulados: pontos,
      mensagem: aprovado
        ? 'Pagamento aprovado. O pedido foi enviado para a cozinha.'
        : `Pagamento recusado: ${resposta.motivo ?? 'motivo não informado'}. Você pode tentar novamente com outra forma de pagamento.`,
      reaproveitado: false,
    };
  }

  async obter(id: number, ctx: ContextoRequisicao) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id }, include: { pedido: true } });
    if (!pagamento) throw new NaoEncontradoError('PAGAMENTO_NAO_ENCONTRADO', `Pagamento ${id} não encontrado.`);
    this.pedidos.garantirAcessoAoPedido(pagamento.pedido, ctx.usuario);
    return pagamento;
  }

  private async reaproveitar(anterior: Pagamento, pedidoId: number): Promise<ResultadoPagamento> {
    if (anterior.pedidoId !== pedidoId) {
      throw new RegraNegocioError(
        'IDEMPOTENCY_KEY_REUTILIZADA',
        'Esta Idempotency-Key já foi usada para outro pedido.',
        [{ field: 'Idempotency-Key', issue: 'Gere uma nova chave para cada tentativa de pagamento' }],
      );
    }
    const pedido = await this.prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    this.logger.log(`Requisição idempotente reaproveitada: pagamento #${anterior.id}`);
    return {
      pagamento: anterior,
      statusPedido: pedido.status,
      pontosAcumulados: 0,
      mensagem: 'Requisição repetida: retornando o resultado do pagamento já processado.',
      reaproveitado: true,
    };
  }

  private async registrarFalha(pedidoId: number, solicitacao: SolicitacaoPagamento, erro: unknown, ctx: ContextoRequisicao) {
    const motivo = erro instanceof Error ? erro.message : 'Erro desconhecido';
    const pagamento = await this.prisma.pagamento.create({
      data: {
        pedidoId,
        // sufixo pra liberar a chave original e o cliente poder tentar de novo
        idempotencyKey: `${solicitacao.idempotencyKey}:falha:${randomUUID()}`,
        forma: solicitacao.forma,
        valorCentavos: solicitacao.valorCentavos,
        status: StatusPagamento.ERRO,
        motivo,
        payloadEnvio: JSON.stringify(solicitacao),
      },
    });
    await this.auditoria.registrar(
      { acao: AcaoAuditoria.PAGAMENTO_FALHA_INTEGRACAO, entidade: 'Pagamento', entidadeId: pagamento.id, detalhes: { pedidoId, motivo } },
      ctx,
    );
    this.logger.warn(`Falha na integração de pagamento do pedido #${pedidoId}: ${motivo}`);
  }

  private comTimeout<T>(promessa: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(
        () => rejeitar(new IntegracaoExternaError('GATEWAY_TIMEOUT', 'O serviço de pagamento não respondeu a tempo.')),
        TIMEOUT_GATEWAY_MS,
      );
    });
    return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
  }
}
