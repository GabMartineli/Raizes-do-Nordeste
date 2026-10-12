# Raízes do Nordeste - API

API back-end da rede de lanchonetes Raízes do Nordeste, feita para o Projeto Multidisciplinar (trilha Back-End, 2026).

A rede tem uma matriz e várias filiais, cada uma com cardápio, preços e estoque próprios. Os pedidos chegam por app, totem, balcão, pickup e site. O fluxo principal implementado é: o cliente faz o pedido, paga (pagamento simulado) e a cozinha atualiza o status até a entrega.

- Repositório: https://github.com/SEU-USUARIO/raizes-do-nordeste
- Swagger (com a API rodando): http://localhost:3000/docs
- Coleção do Postman: pasta `postman/`

## Tecnologias

Node.js 22 ou mais novo, NestJS, TypeScript, Prisma com SQLite, JWT, bcrypt, Swagger, Jest e Newman.

O banco é SQLite, então não precisa instalar nada: o arquivo é criado sozinho na pasta `prisma/`.

## Como rodar

```bash
npm install
cp .env.example .env
npm run setup
npm run start
```

No Windows, o segundo comando é `copy .env.example .env`.

O `npm run setup` cria o banco, roda as migrations e o seed (dados de teste). Depois disso a API fica em http://localhost:3000 e a documentação em http://localhost:3000/docs.

Para voltar o banco ao estado inicial a qualquer momento: `npm run db:seed`.

### Variáveis de ambiente

Estão no `.env.example`:

- `DATABASE_URL`: caminho do banco SQLite
- `JWT_SECRET`: segredo usado para assinar o token
- `JWT_EXPIRES_IN_SECONDS`: tempo de validade do token (padrão 3600)
- `PORT`: porta da API (padrão 3000)
- `RATE_LIMIT_POR_MINUTO` e `LOGIN_LIMITE_POR_MINUTO`: limite de requisições por IP

### Usuários de teste

Todos com a senha `Raizes@2026`:

| E-mail | Perfil |
|---|---|
| admin@raizes.com | ADMIN (matriz) |
| gerente.recife@raizes.com | GERENTE da unidade 2 (Boa Viagem) |
| atendente.recife@raizes.com | ATENDENTE da unidade 2 |
| cozinha.recife@raizes.com | COZINHA da unidade 2 |
| gerente.salvador@raizes.com | GERENTE da unidade 3 (Pelourinho) |
| cliente@raizes.com | CLIENTE com 200 pontos de fidelidade |
| cliente2@raizes.com | CLIENTE sem programa de fidelidade |

## Testando

Pelo Swagger: faça login em `POST /auth/login`, copie o `accessToken`, clique em Authorize e cole. O passo a passo completo está em `docs/plano-de-testes.md`.

Pelo Postman (com a API rodando):

```bash
npm run db:seed
npm run test:postman
```

Ou importe os dois arquivos da pasta `postman/` no aplicativo do Postman e use "Run collection".

Testes automatizados:

```bash
npm test
```

Na última execução, a coleção do Postman passou com 45 requisições e 107 verificações, e o `npm test`, com 57 testes.

## Endpoints principais

- `POST /auth/registrar` e `POST /auth/login`
- `GET /usuarios/me`, `PATCH /usuarios/me`, `DELETE /usuarios/me` (dados do próprio usuário / LGPD)
- `GET /unidades` e `GET /unidades/{id}/cardapio`
- `GET /produtos`
- `GET /estoque` e `POST /estoque/movimentacoes` (funcionários)
- `POST /pedidos`, `GET /pedidos` (filtros `canalPedido`, `status`, `unidadeId`), `GET /pedidos/{id}`
- `PATCH /pedidos/{id}/status` e `POST /pedidos/{id}/cancelar`
- `POST /pagamentos` (aceita o header `Idempotency-Key`)
- `GET /fidelidade/saldo`, `GET /fidelidade/extrato`, `POST` e `DELETE /fidelidade/consentimento`
- `GET /auditoria` (gerente/admin)

A lista completa, com exemplos de request e response, está no Swagger.

Todos os erros voltam no mesmo formato:

```json
{
  "error": "ESTOQUE_INSUFICIENTE",
  "message": "Não há quantidade suficiente para um ou mais itens.",
  "details": [{ "field": "itens[0].quantidade", "issue": "Produto 9 - disponível: 1" }],
  "timestamp": "2026-10-04T12:00:00.000Z",
  "path": "/pedidos",
  "requestId": "6f1c2b8e-3d4a-4b6e-9a51-2f7c8d9e0a1b"
}
```

## Pagamento simulado

Não existe integração com um gateway real. A classe `GatewayPagamentoMock` faz o papel do provedor e devolve uma resposta parecida com a de um gateway de verdade. No `POST /pagamentos` dá para mandar `cenarioMock` com `APROVAR`, `RECUSAR` ou `FALHA_COMUNICACAO` para forçar o resultado. Sem esse campo, pedidos acima de R$ 500 são recusados e os demais aprovados.

## Estrutura

```
src/
  domain/          regras de negócio (status do pedido, canais, cálculo, pontos)
  application/     serviços com os casos de uso
  infrastructure/  prisma, pagamento mock, senha e token
  api/             controllers, DTOs, guards e tratamento de erro
prisma/            schema, migrations e seed
test/              testes e2e
postman/           coleção e environment
docs/              requisitos, plano de testes e diagramas
```

## Documentação

- `docs/escopo-e-requisitos.md`: requisitos, LGPD e o que foi feito ou ficou de fora
- `docs/plano-de-testes.md`: cenários de teste
- `docs/diagramas/`: casos de uso, DER, classes, sequência e arquitetura
