import { AcessoNegadoError, RegraNegocioError } from '../shared/errors';
import { Perfil, StatusPedido } from '../shared/enums';
import {
  cancelamentoExigeEstorno,
  validarCancelamento,
  validarPedidoPagavel,
  validarTransicaoOperacional,
} from './status-pedido.rules';

describe('Máquina de estados do pedido', () => {
  describe('transições operacionais', () => {
    it.each([
      [StatusPedido.PAGO, StatusPedido.EM_PREPARO, Perfil.COZINHA],
      [StatusPedido.EM_PREPARO, StatusPedido.PRONTO, Perfil.COZINHA],
      [StatusPedido.PRONTO, StatusPedido.ENTREGUE, Perfil.ATENDENTE],
      [StatusPedido.PRONTO, StatusPedido.ENTREGUE, Perfil.GERENTE],
    ])('permite %s → %s para %s', (de, para, perfil) => {
      expect(() => validarTransicaoOperacional(de, para, perfil)).not.toThrow();
    });

    it('não permite pular etapas (PAGO → PRONTO)', () => {
      expect(() => validarTransicaoOperacional(StatusPedido.PAGO, StatusPedido.PRONTO, Perfil.COZINHA)).toThrow(RegraNegocioError);
    });

    it('não permite preparar pedido ainda não pago', () => {
      expect(() =>
        validarTransicaoOperacional(StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.EM_PREPARO, Perfil.COZINHA),
      ).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_STATUS_INVALIDA' }));
    });

    it('atendente não pode iniciar o preparo', () => {
      expect(() => validarTransicaoOperacional(StatusPedido.PAGO, StatusPedido.EM_PREPARO, Perfil.ATENDENTE)).toThrow(
        AcessoNegadoError,
      );
    });
  });

  describe('cancelamento', () => {
    it('cliente cancela antes do pagamento', () => {
      expect(() => validarCancelamento(StatusPedido.AGUARDANDO_PAGAMENTO, Perfil.CLIENTE)).not.toThrow();
    });

    it('cliente não cancela pedido já pago', () => {
      expect(() => validarCancelamento(StatusPedido.PAGO, Perfil.CLIENTE)).toThrow(
        expect.objectContaining({ codigo: 'CANCELAMENTO_NAO_PERMITIDO' }),
      );
    });

    it('gerente cancela pedido em preparo e exige estorno', () => {
      expect(() => validarCancelamento(StatusPedido.EM_PREPARO, Perfil.GERENTE)).not.toThrow();
      expect(cancelamentoExigeEstorno(StatusPedido.EM_PREPARO)).toBe(true);
    });

    it('ninguém cancela pedido pronto ou entregue', () => {
      expect(() => validarCancelamento(StatusPedido.PRONTO, Perfil.ADMIN)).toThrow(RegraNegocioError);
      expect(() => validarCancelamento(StatusPedido.ENTREGUE, Perfil.ADMIN)).toThrow(RegraNegocioError);
    });

    it('cozinha nunca cancela', () => {
      expect(() => validarCancelamento(StatusPedido.AGUARDANDO_PAGAMENTO, Perfil.COZINHA)).toThrow(AcessoNegadoError);
    });
  });

  describe('pagamento', () => {
    it('aceita pagamento de pedido aguardando ou recusado', () => {
      expect(() => validarPedidoPagavel(StatusPedido.AGUARDANDO_PAGAMENTO)).not.toThrow();
      expect(() => validarPedidoPagavel(StatusPedido.PAGAMENTO_RECUSADO)).not.toThrow();
    });

    it('recusa pagar duas vezes', () => {
      expect(() => validarPedidoPagavel(StatusPedido.PAGO)).toThrow(expect.objectContaining({ codigo: 'PEDIDO_JA_PAGO' }));
    });

    it('recusa pagar pedido cancelado', () => {
      expect(() => validarPedidoPagavel(StatusPedido.CANCELADO)).toThrow(expect.objectContaining({ codigo: 'PEDIDO_CANCELADO' }));
    });
  });
});
