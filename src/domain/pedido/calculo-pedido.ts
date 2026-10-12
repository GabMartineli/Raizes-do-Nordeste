import { RegraNegocioError } from '../shared/errors';
import { calcularDescontoResgate } from '../fidelidade/fidelidade.rules';

export interface ItemSolicitado {
  produtoId: number;
  quantidade: number;
}

export interface ItemPrecificado extends ItemSolicitado {
  precoUnitarioCentavos: number;
}

export interface ItemCalculado extends ItemPrecificado {
  subtotalCentavos: number;
}

export interface TotaisPedido {
  itens: ItemCalculado[];
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  pontosResgatados: number;
}

export function consolidarItens(itens: ItemSolicitado[]): ItemSolicitado[] {
  const porProduto = new Map<number, number>();
  for (const item of itens) {
    porProduto.set(item.produtoId, (porProduto.get(item.produtoId) ?? 0) + item.quantidade);
  }
  return [...porProduto.entries()].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
}

export function calcularTotais(itens: ItemPrecificado[], pontosParaResgatar = 0, saldoPontos = 0): TotaisPedido {
  if (itens.length === 0) {
    throw new RegraNegocioError('PEDIDO_SEM_ITENS', 'O pedido precisa ter ao menos um item.');
  }
  const calculados = itens.map((item) => ({
    ...item,
    subtotalCentavos: item.precoUnitarioCentavos * item.quantidade,
  }));
  const subtotalCentavos = calculados.reduce((soma, item) => soma + item.subtotalCentavos, 0);
  const descontoCentavos = calcularDescontoResgate(pontosParaResgatar, saldoPontos, subtotalCentavos);

  return {
    itens: calculados,
    subtotalCentavos,
    descontoCentavos,
    totalCentavos: subtotalCentavos - descontoCentavos,
    pontosResgatados: pontosParaResgatar,
  };
}
