import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IntegracaoExternaError } from '../../domain/shared/errors';
import {
  CenarioMock,
  GatewayPagamento,
  RespostaGateway,
  SolicitacaoPagamento,
} from '../../domain/pagamento/gateway-pagamento.port';

const LIMITE_APROVACAO_CENTAVOS = 50_000;

@Injectable()
export class GatewayPagamentoMock implements GatewayPagamento {
  private readonly logger = new Logger('GatewayPagamentoMock');

  async cobrar(solicitacao: SolicitacaoPagamento): Promise<RespostaGateway> {
    await this.latenciaDeRede();
    this.logger.log(`Cobrança ${solicitacao.referencia} (${solicitacao.forma}) cenário=${solicitacao.cenario ?? 'AUTO'}`);

    if (solicitacao.cenario === CenarioMock.FALHA_COMUNICACAO) {
      throw new IntegracaoExternaError(
        'GATEWAY_INDISPONIVEL',
        'O serviço de pagamento está indisponível no momento. Tente novamente em instantes.',
      );
    }

    // sem cenario: acima de R$ 500 recusa, abaixo aprova
    const recusar =
      solicitacao.cenario === CenarioMock.RECUSAR ||
      (!solicitacao.cenario && solicitacao.valorCentavos > LIMITE_APROVACAO_CENTAVOS);

    return {
      transacaoId: `mock_${randomUUID()}`,
      status: recusar ? 'RECUSADO' : 'APROVADO',
      motivo: recusar
        ? solicitacao.cenario === CenarioMock.RECUSAR
          ? 'Pagamento recusado pelo emissor.'
          : 'Valor acima do limite de aprovação.'
        : undefined,
      processadoEm: new Date().toISOString(),
    };
  }

  async estornar(transacaoId: string): Promise<{ estornoId: string }> {
    await this.latenciaDeRede();
    this.logger.log(`Estorno da transação ${transacaoId}`);
    return { estornoId: `mock_estorno_${randomUUID()}` };
  }

  private latenciaDeRede(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 30));
  }
}
