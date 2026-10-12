import { RegraNegocioError } from '../shared/errors';

export const CENTAVOS_POR_PONTO_ACUMULADO = 100;

export const VALOR_PONTO_RESGATE_CENTAVOS = 10;

export const PERCENTUAL_MAXIMO_DESCONTO = 0.5;

export const VERSAO_TERMO_FIDELIDADE = '2026.1';

export function calcularPontosGanhos(totalPagoCentavos: number): number {
  return Math.floor(totalPagoCentavos / CENTAVOS_POR_PONTO_ACUMULADO);
}

export function calcularDescontoResgate(pontos: number, saldoPontos: number, subtotalCentavos: number): number {
  if (pontos === 0) return 0;
  if (!Number.isInteger(pontos) || pontos < 0) {
    throw new RegraNegocioError('PONTOS_INVALIDOS', 'A quantidade de pontos deve ser um inteiro positivo.');
  }
  if (pontos > saldoPontos) {
    throw new RegraNegocioError('SALDO_PONTOS_INSUFICIENTE', 'Saldo de pontos insuficiente para o resgate.', [
      { field: 'pontosResgate', issue: `Saldo disponível: ${saldoPontos}` },
    ]);
  }
  const desconto = pontos * VALOR_PONTO_RESGATE_CENTAVOS;
  const limite = Math.floor(subtotalCentavos * PERCENTUAL_MAXIMO_DESCONTO);
  if (desconto > limite) {
    const maximoPontos = Math.floor(limite / VALOR_PONTO_RESGATE_CENTAVOS);
    throw new RegraNegocioError(
      'LIMITE_RESGATE_EXCEDIDO',
      'O desconto por pontos não pode ultrapassar 50% do subtotal do pedido.',
      [{ field: 'pontosResgate', issue: `Máximo de pontos para este pedido: ${maximoPontos}` }],
    );
  }
  return desconto;
}
