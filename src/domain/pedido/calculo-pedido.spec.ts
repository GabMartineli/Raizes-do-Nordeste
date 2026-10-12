import { CanalPedido, Perfil } from '../shared/enums';
import { calcularPontosGanhos } from '../fidelidade/fidelidade.rules';
import { calcularTotais, consolidarItens } from './calculo-pedido';
import { validarCanalParaPerfil } from './canal-pedido.rules';

describe('Cálculo do pedido', () => {
  const itens = [
    { produtoId: 1, quantidade: 2, precoUnitarioCentavos: 1890 },
    { produtoId: 10, quantidade: 1, precoUnitarioCentavos: 990 },
  ];

  it('soma os subtotais em centavos, sem erro de arredondamento', () => {
    const totais = calcularTotais(itens);
    expect(totais.subtotalCentavos).toBe(4770);
    expect(totais.totalCentavos).toBe(4770);
    expect(totais.itens[0].subtotalCentavos).toBe(3780);
  });

  it('aplica desconto de resgate (10 pontos = R$ 1,00)', () => {
    const totais = calcularTotais(itens, 50, 200);
    expect(totais.descontoCentavos).toBe(500);
    expect(totais.totalCentavos).toBe(4270);
  });

  it('recusa resgate acima do saldo', () => {
    expect(() => calcularTotais(itens, 300, 200)).toThrow(expect.objectContaining({ codigo: 'SALDO_PONTOS_INSUFICIENTE' }));
  });

  it('limita o desconto a 50% do subtotal', () => {
    expect(() => calcularTotais(itens, 300, 1000)).toThrow(expect.objectContaining({ codigo: 'LIMITE_RESGATE_EXCEDIDO' }));
  });

  it('recusa pedido sem itens', () => {
    expect(() => calcularTotais([])).toThrow(expect.objectContaining({ codigo: 'PEDIDO_SEM_ITENS' }));
  });

  it('consolida itens repetidos do mesmo produto', () => {
    expect(
      consolidarItens([
        { produtoId: 1, quantidade: 1 },
        { produtoId: 2, quantidade: 1 },
        { produtoId: 1, quantidade: 2 },
      ]),
    ).toEqual([
      { produtoId: 1, quantidade: 3 },
      { produtoId: 2, quantidade: 1 },
    ]);
  });

  it('acumula 1 ponto por real pago', () => {
    expect(calcularPontosGanhos(4270)).toBe(42);
    expect(calcularPontosGanhos(99)).toBe(0);
  });
});

describe('Multicanalidade: canal x perfil', () => {
  it.each([CanalPedido.APP, CanalPedido.TOTEM, CanalPedido.WEB, CanalPedido.PICKUP])('cliente pode usar %s', (canal) => {
    expect(() => validarCanalParaPerfil(canal, Perfil.CLIENTE)).not.toThrow();
  });

  it('cliente não pode abrir pedido de BALCAO', () => {
    expect(() => validarCanalParaPerfil(CanalPedido.BALCAO, Perfil.CLIENTE)).toThrow(
      expect.objectContaining({ codigo: 'CANAL_NAO_PERMITIDO' }),
    );
  });

  it('atendente abre pedido de BALCAO mas não de APP', () => {
    expect(() => validarCanalParaPerfil(CanalPedido.BALCAO, Perfil.ATENDENTE)).not.toThrow();
    expect(() => validarCanalParaPerfil(CanalPedido.APP, Perfil.ATENDENTE)).toThrow();
  });
});
