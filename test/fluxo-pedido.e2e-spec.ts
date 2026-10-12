import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/bootstrap';

describe('Um dia na lanchonete: pedido → pagamento → cozinha → entrega (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const SENHA = 'Raizes@2026';
  const tokens: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await http.post('/auth/login').send({ email, senha: SENHA }).expect(200);
    return res.body.accessToken as string;
  };
  const auth = (perfil: string) => ({ Authorization: `Bearer ${tokens[perfil]}` });
  const novoPedido = (extra: object = {}) => ({
    canalPedido: 'TOTEM',
    unidadeId: 2,
    itens: [
      { produtoId: 1, quantidade: 2 },
      { produtoId: 10, quantidade: 1 },
    ],
    formaPagamento: 'PIX',
    ...extra,
  });

  const esperarErroPadrao = (body: Record<string, unknown>, codigo: string) => {
    expect(body).toEqual(
      expect.objectContaining({
        error: codigo,
        message: expect.any(String),
        details: expect.any(Array),
        timestamp: expect.any(String),
        path: expect.any(String),
        requestId: expect.any(String),
      }),
    );
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    http = request(app.getHttpServer());

    tokens.cliente = await login('cliente@raizes.com');
    tokens.cliente2 = await login('cliente2@raizes.com');
    tokens.cozinha = await login('cozinha.recife@raizes.com');
    tokens.atendente = await login('atendente.recife@raizes.com');
    tokens.gerenteSalvador = await login('gerente.salvador@raizes.com');
    tokens.admin = await login('admin@raizes.com');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Autenticação e autorização', () => {
    it('T01 - Maria entra com e-mail e senha certos e recebe o token', async () => {
      const res = await http.post('/auth/login').send({ email: 'cliente@raizes.com', senha: SENHA }).expect(200);
      expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { perfil: 'CLIENTE' } });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).not.toHaveProperty('senhaHash');
    });

    it('T02 - Maria erra a senha e é barrada (401)', async () => {
      const res = await http.post('/auth/login').send({ email: 'cliente@raizes.com', senha: 'errada123' }).expect(401);
      esperarErroPadrao(res.body, 'CREDENCIAIS_INVALIDAS');
    });

    it('T09 - Alguém sem login tenta ver pedidos (401)', async () => {
      const res = await http.get('/pedidos').expect(401);
      esperarErroPadrao(res.body, 'TOKEN_AUSENTE');
    });

    it('T06 - Maria tenta espiar o estoque e é barrada (403)', async () => {
      const res = await http.get('/estoque').set(auth('cliente')).expect(403);
      esperarErroPadrao(res.body, 'ACESSO_NEGADO');
    });

    it('T12 - Maria tenta fazer pedido como se fosse o balcão (403)', async () => {
      const res = await http.post('/pedidos').set(auth('cliente')).send(novoPedido({ canalPedido: 'BALCAO' })).expect(403);
      esperarErroPadrao(res.body, 'CANAL_NAO_PERMITIDO');
    });
  });

  describe('Validação de dados', () => {
    it('T10 - Pedido sem dizer de qual canal veio (422)', async () => {
      const { canalPedido, ...semCanal } = novoPedido();
      const res = await http.post('/pedidos').set(auth('cliente')).send(semCanal).expect(422);
      esperarErroPadrao(res.body, 'VALIDACAO');
      expect(res.body.details).toContainEqual(expect.objectContaining({ field: 'canalPedido' }));
      expect(canalPedido).toBe('TOTEM');
    });

    it('Extra - Pedido vindo de um canal que não existe (422)', async () => {
      const res = await http.post('/pedidos').set(auth('cliente')).send(novoPedido({ canalPedido: 'TELEFONE' })).expect(422);
      expect(res.body.details[0].field).toBe('canalPedido');
    });

    it('T11 - Pedido com quantidade negativa (422)', async () => {
      const res = await http
        .post('/pedidos')
        .set(auth('cliente'))
        .send(novoPedido({ itens: [{ produtoId: 1, quantidade: -1 }] }))
        .expect(422);
      expect(res.body.details).toContainEqual(expect.objectContaining({ field: 'itens[0].quantidade' }));
    });

    it('T03 - Cadastro com um e-mail que não é e-mail (422)', async () => {
      const res = await http.post('/auth/registrar').send({ nome: 'Teste', email: 'nao-e-email', senha: 'Senha123' }).expect(422);
      expect(res.body.details[0].field).toBe('email');
    });
  });

  describe('Regras de negócio do pedido', () => {
    let pedidoId: number;

    it('T13 - Maria pede 2 tapiocas e 1 suco no totem (201, total R$ 47,70)', async () => {
      const res = await http.post('/pedidos').set(auth('cliente')).send(novoPedido()).expect(201);
      expect(res.body).toMatchObject({ status: 'AGUARDANDO_PAGAMENTO', canalPedido: 'TOTEM', unidadeId: 2, subtotal: 47.7, total: 47.7 });
      pedidoId = res.body.id;
    });

    it('T14 - Pedido de um produto que não existe (404)', async () => {
      const res = await http
        .post('/pedidos')
        .set(auth('cliente'))
        .send(novoPedido({ itens: [{ produtoId: 9999, quantidade: 1 }] }))
        .expect(404);
      esperarErroPadrao(res.body, 'PRODUTO_NAO_ENCONTRADO');
    });

    it('T15 - Pedido numa loja que não existe (404)', async () => {
      const res = await http.post('/pedidos').set(auth('cliente')).send(novoPedido({ unidadeId: 999 })).expect(404);
      esperarErroPadrao(res.body, 'UNIDADE_NAO_ENCONTRADA');
    });

    it('T16 - Maria pede 3 cartolas, mas só tem 1 (409)', async () => {
      const res = await http
        .post('/pedidos')
        .set(auth('cliente'))
        .send(novoPedido({ itens: [{ produtoId: 9, quantidade: 3 }] }))
        .expect(409);
      esperarErroPadrao(res.body, 'ESTOQUE_INSUFICIENTE');
      expect(res.body.details[0].issue).toContain('disponível: 1');
    });

    it('T17 - Maria filtra só os pedidos feitos no totem', async () => {
      await http.post('/pedidos').set(auth('cliente')).send(novoPedido({ canalPedido: 'APP' })).expect(201);
      const res = await http.get('/pedidos?canalPedido=TOTEM&page=1&limit=10').set(auth('cliente')).expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((p: { canalPedido: string }) => p.canalPedido === 'TOTEM')).toBe(true);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });
    });

    it('T18 - José tenta ver o pedido da Maria (404)', async () => {
      await http.get(`/pedidos/${pedidoId}`).set(auth('cliente2')).expect(404);
    });

    it('Extra - Gerente de Salvador tenta ver um pedido de Recife (403)', async () => {
      await http.get(`/pedidos/${pedidoId}`).set(auth('gerenteSalvador')).expect(403);
    });
  });

  describe('Pagamento mock e atualização de status', () => {
    let pedidoId: number;

    beforeAll(async () => {
      const res = await http.post('/pedidos').set(auth('cliente')).send(novoPedido({ pontosResgate: 50 })).expect(201);
      pedidoId = res.body.id;
      expect(res.body).toMatchObject({ desconto: 5, total: 42.7, pontosResgatados: 50 });
    });

    it('T19 - O cartão da Maria é recusado e o pedido pode ser pago de novo', async () => {
      const res = await http
        .post('/pagamentos')
        .set(auth('cliente'))
        .set('Idempotency-Key', `recusa-${pedidoId}`)
        .send({ pedidoId, cenarioMock: 'RECUSAR' })
        .expect(201);
      expect(res.body).toMatchObject({ statusPedido: 'PAGAMENTO_RECUSADO', pagamento: { status: 'RECUSADO' } });
      expect(res.body.mensagem).toContain('recusado');
    });

    it('T20 - O sistema de pagamento sai do ar (503) e o pedido não muda', async () => {
      const res = await http.post('/pagamentos').set(auth('cliente')).send({ pedidoId, cenarioMock: 'FALHA_COMUNICACAO' }).expect(503);
      esperarErroPadrao(res.body, 'GATEWAY_INDISPONIVEL');
      const pedido = await http.get(`/pedidos/${pedidoId}`).set(auth('cliente')).expect(200);
      expect(pedido.body.status).toBe('PAGAMENTO_RECUSADO');
    });

    it('T21 - Maria paga, o pagamento é aprovado e ela ganha pontos', async () => {
      const res = await http
        .post('/pagamentos')
        .set(auth('cliente'))
        .set('Idempotency-Key', `aprova-${pedidoId}`)
        .send({ pedidoId, cenarioMock: 'APROVAR' })
        .expect(201);
      expect(res.body).toMatchObject({ statusPedido: 'PAGO', pagamento: { status: 'APROVADO', valor: 42.7 }, pontosAcumulados: 42 });
    });

    it('T22 - O app manda o mesmo pagamento duas vezes e só cobra uma (200)', async () => {
      const res = await http
        .post('/pagamentos')
        .set(auth('cliente'))
        .set('Idempotency-Key', `aprova-${pedidoId}`)
        .send({ pedidoId })
        .expect(200);
      expect(res.headers['idempotent-replayed']).toBe('true');
    });

    it('T23 - Tentar pagar um pedido que já foi pago (409)', async () => {
      const res = await http.post('/pagamentos').set(auth('cliente')).send({ pedidoId }).expect(409);
      esperarErroPadrao(res.body, 'PEDIDO_JA_PAGO');
    });

    it('T25 - Cozinha tenta pular direto para entregue (409)', async () => {
      const res = await http.patch(`/pedidos/${pedidoId}/status`).set(auth('cozinha')).send({ status: 'ENTREGUE' }).expect(409);
      esperarErroPadrao(res.body, 'TRANSICAO_STATUS_INVALIDA');
    });

    it('T24 - Maria tenta marcar o próprio pedido como em preparo (403)', async () => {
      await http.patch(`/pedidos/${pedidoId}/status`).set(auth('cliente')).send({ status: 'EM_PREPARO' }).expect(403);
    });

    it('T26 - Cozinha prepara, avisa que está pronto e o atendente entrega', async () => {
      await http.patch(`/pedidos/${pedidoId}/status`).set(auth('cozinha')).send({ status: 'EM_PREPARO' }).expect(200);
      await http.patch(`/pedidos/${pedidoId}/status`).set(auth('cozinha')).send({ status: 'PRONTO' }).expect(200);
      const res = await http.patch(`/pedidos/${pedidoId}/status`).set(auth('atendente')).send({ status: 'ENTREGUE' }).expect(200);
      expect(res.body.status).toBe('ENTREGUE');
    });

    it('T27 - Admin confere na auditoria quem mexeu no pedido', async () => {
      const res = await http
        .get(`/auditoria?entidade=Pedido&entidadeId=${pedidoId}&acao=PEDIDO_STATUS_ALTERADO`)
        .set(auth('admin'))
        .expect(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0]).toMatchObject({ detalhes: { de: 'PRONTO', para: 'ENTREGUE' } });
    });

    it('Extra - Saldo de pontos fecha a conta: 200 - 50 usados + 42 ganhos = 192', async () => {
      const res = await http.get('/fidelidade/saldo').set(auth('cliente')).expect(200);
      expect(res.body.saldoPontos).toBe(192);
    });
  });

  describe('Cancelamento e estoque', () => {
    it('T28 - Cliente do balcão desiste: dinheiro estornado e estoque devolvido', async () => {
      const saldoAntes = await http.get('/estoque?unidadeId=2&produtoId=1').set(auth('atendente')).expect(200);
      const criado = await http
        .post('/pedidos')
        .set(auth('atendente'))
        .send(novoPedido({ canalPedido: 'BALCAO', itens: [{ produtoId: 1, quantidade: 3 }] }))
        .expect(201);
      await http.post('/pagamentos').set(auth('atendente')).send({ pedidoId: criado.body.id }).expect(201);

      const cancelado = await http
        .post(`/pedidos/${criado.body.id}/cancelar`)
        .set(auth('atendente'))
        .send({ motivo: 'Cliente desistiu' })
        .expect(200);
      expect(cancelado.body).toMatchObject({ status: 'CANCELADO', pagamentos: [{ status: 'ESTORNADO' }] });

      const saldoDepois = await http.get('/estoque?unidadeId=2&produtoId=1').set(auth('atendente')).expect(200);
      expect(saldoDepois.body.data[0].quantidade).toBe(saldoAntes.body.data[0].quantidade);
    });
  });

  describe('LGPD', () => {
    it('Extra - Cadastro com adesão aos pontos registra o consentimento e esconde a senha', async () => {
      const res = await http
        .post('/auth/registrar')
        .send({ nome: 'Ana Teste', email: 'ana.teste@exemplo.com', senha: 'Senha1234', aceitaProgramaFidelidade: true })
        .expect(201);
      expect(res.body).not.toHaveProperty('senhaHash');
      const token = await login('ana.teste@exemplo.com').catch(() => null);
      expect(token).toBeNull(); // senha diferente da padrão do seed
      const ok = await http.post('/auth/login').send({ email: 'ana.teste@exemplo.com', senha: 'Senha1234' }).expect(200);
      const me = await http.get('/usuarios/me').set({ Authorization: `Bearer ${ok.body.accessToken}` }).expect(200);
      expect(me.body.consentimentos).toContainEqual(expect.objectContaining({ finalidade: 'FIDELIDADE' }));
    });

    it('T30 - Gerente consulta a Maria, vê o contato escondido e o acesso fica registrado', async () => {
      const gerente = await login('gerente.recife@raizes.com');
      const res = await http.get('/usuarios/6').set({ Authorization: `Bearer ${gerente}` }).expect(200);
      expect(res.body.email).toBe('cl***@raizes.com');
      expect(res.body.telefone).toBe('(81) *****-4321');
      const log = await http.get('/auditoria?acao=ACESSO_DADOS_PESSOAIS&entidadeId=6').set(auth('admin')).expect(200);
      expect(log.body.meta.total).toBeGreaterThan(0);
    });
  });
});
