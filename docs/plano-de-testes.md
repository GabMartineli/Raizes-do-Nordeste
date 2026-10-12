*USADO IA PARA CORRIGIR ERROS DE PORTUGUÊS E DEIXAR MAIS FACIL DE ENTENDER*

# Plano de testes

A ideia dos testes é simular o dia a dia da lanchonete: um cliente faz um pedido, paga, a cozinha prepara e o atendente entrega. Também testo de propósito as situações erradas (pedir algo que acabou, acessar o que não pode, mandar dados inválidos) para ver se a API responde com o erro certo.

Existem três formas de testar:

1. Manualmente, pelo Swagger, seguindo o roteiro abaixo.
2. Pela coleção do Postman, que roda todos os cenários de uma vez.
3. Com `npm test`, que roda os testes automatizados do código.

## Dados de teste

O seed (`npm run db:seed`) sempre cria os mesmos dados. A senha de todos os usuários é `Raizes@2026`.

- Maria (`cliente@raizes.com`): cliente que aceitou o programa de pontos e já tem 200 pontos.
- José (`cliente2@raizes.com`): cliente que não aceitou o programa de pontos.
- Cozinha, atendente e gerente da unidade 2 (Boa Viagem): `cozinha.recife@raizes.com`, `atendente.recife@raizes.com` e `gerente.recife@raizes.com`.
- Gerente da unidade 3 (Salvador): `gerente.salvador@raizes.com`.
- Admin da matriz: `admin@raizes.com`.

Os testes usam a unidade 2. Alguns produtos dela foram preparados para os testes:

- Tapioca de carne de sol (id 1): R$ 18,90
- Suco de cajá (id 10): R$ 9,90
- Cuscuz com ovo (id 3): R$ 14,90
- Cartola (id 9): só 1 unidade em estoque, usada para testar estoque insuficiente
- Caldo de cana (id 11): estoque zerado, aparece como indisponível

## Testando pelo Swagger

Com a API rodando, abra http://localhost:3000/docs. Em cada rota, clique em "Try it out", cole o JSON e clique em "Execute".

1. Login da Maria. Em `POST /auth/login`, envie:
   ```json
   { "email": "cliente@raizes.com", "senha": "Raizes@2026" }
   ```
   Deve voltar 200 com um `accessToken`. Copie o token, clique em "Authorize" no topo da página e cole. Se a senha estiver errada, volta 401.

2. Cardápio. Em `GET /unidades/{id}/cardapio`, use o id 2. Deve voltar a lista de produtos com os preços, com o caldo de cana marcado como `"disponivel": false`.

3. Fazer o pedido. Em `POST /pedidos`, envie:
   ```json
   {
     "canalPedido": "TOTEM",
     "unidadeId": 2,
     "itens": [
       { "produtoId": 1, "quantidade": 2 },
       { "produtoId": 10, "quantidade": 1 }
     ],
     "formaPagamento": "PIX"
   }
   ```
   Deve voltar 201, com status `AGUARDANDO_PAGAMENTO`, canal `TOTEM` e total 47.7. Anote o `id` do pedido.

4. Estoque insuficiente. Faça outro pedido, agora com `{ "produtoId": 9, "quantidade": 3 }` nos itens. Deve voltar 409 (`ESTOQUE_INSUFICIENTE`), informando que só tem 1. Se você tirar o campo `canalPedido`, volta 422.

5. Pagamento recusado. Em `POST /pagamentos`, envie `{ "pedidoId": <id>, "cenarioMock": "RECUSAR" }`. O pagamento volta como `RECUSADO` e o pedido fica `PAGAMENTO_RECUSADO`, ainda podendo ser pago.

6. Pagamento aprovado. Envie de novo com `"cenarioMock": "APROVAR"`. O pedido vai para `PAGO` e a Maria ganha 47 pontos. Se mandar uma terceira vez, volta 409 (`PEDIDO_JA_PAGO`).

7. Cozinha. Clique em "Authorize", saia, faça login com a cozinha e use o novo token. Em `PATCH /pedidos/{id}/status`:
   - mande `{ "status": "ENTREGUE" }`: deve dar 409, porque não pode pular etapas;
   - mande `EM_PREPARO` e depois `PRONTO`: os dois devem dar 200;
   - entre como atendente e mande `ENTREGUE`: deve dar 200.

   Se a Maria tentar mudar o status, volta 403.

8. Auditoria. Entre como admin e chame `GET /auditoria` com `entidade=Pedido` e `entidadeId=<id>`. Aparecem a criação do pedido e cada mudança de status, com quem fez e quando. Com `entidade=Pagamento`, aparecem as duas tentativas de pagamento.

9. Sem login. Saia do "Authorize" e chame `GET /pedidos`. Deve voltar 401.

Em todos os erros, a resposta tem sempre os mesmos campos: `error`, `message`, `details`, `timestamp`, `path` e `requestId`.

## Testando pelo Postman

A coleção já tem todos os cenários e as verificações. Os tokens e o id do pedido são guardados automaticamente entre uma requisição e outra.

Pelo terminal, com a API rodando:

```bash
npm run db:seed
npm run test:postman
```

No final aparece um resumo. O esperado é 45 requisições e 107 verificações, com 0 falhas.

Pelo aplicativo: importe os dois arquivos da pasta `postman/`, selecione o environment "Raízes do Nordeste - Local" e clique em "Run collection".

Importante: rode o `npm run db:seed` antes de cada execução, porque a coleção espera os dados no estado inicial.

## Testes automatizados

```bash
npm test
```

São 57 testes: 28 testam as regras de negócio isoladas (cálculo do pedido, pontos, mudança de status, canais) e 29 testam a API inteira, com os mesmos cenários do Postman. Eles usam um banco separado (`test.db`), então não mexem nos dados do dia a dia.

## Cenários

| ID | Cenário | Endpoint | Pré-condição | Entrada | Resultado esperado | Nome no Postman |
|---|---|---|---|---|---|---|
| T01 | Login com dados corretos | POST /auth/login | Seed aplicado | e-mail e senha da Maria | 200, retorna o token e não retorna a senha | T01 - Maria entra com e-mail e senha certos |
| T02 | Login com senha errada | POST /auth/login | - | senha errada | 401 CREDENCIAIS_INVALIDAS | T02 - Maria erra a senha e é barrada |
| T03 | Cadastro com e-mail inválido | POST /auth/registrar | - | email "nao-e-um-email" | 422, erro no campo email | T03 - Alguém tenta se cadastrar com um e-mail que não é e-mail |
| T04 | Ver cardápio da unidade | GET /unidades/2/cardapio | - | - | 200, caldo de cana indisponível | T04 - Qualquer pessoa vê o cardápio da Boa Viagem |
| T05 | Listar produtos com paginação | GET /produtos?page=1&limit=5 | - | - | 200, 5 produtos | T05 - A lista de produtos vem em páginas |
| T06 | Cliente tenta ver o estoque | GET /estoque | Logado como Maria | - | 403 ACESSO_NEGADO | T06 - Maria tenta espiar o estoque e é barrada |
| T07 | Gerente dá entrada no estoque | POST /estoque/movimentacoes | Logado como gerente da unidade 2 | entrada de 10 do produto 2 | 201, saldo vai de 50 para 60 | T07 - Gerente registra a chegada de 10 tapiocas de coco |
| T08 | Gerente de outra unidade mexe no estoque | POST /estoque/movimentacoes | Logado como gerente de Salvador | unidade 2 | 403 ACESSO_NEGADO | T08 - Gerente de Salvador tenta mexer no estoque de Recife |
| T09 | Listar pedidos sem login | GET /pedidos | - | sem token | 401 TOKEN_AUSENTE | T09 - Alguém sem login tenta ver pedidos |
| T10 | Pedido sem canal | POST /pedidos | Logado como Maria | sem canalPedido | 422, erro no campo canalPedido | T10 - Pedido sem dizer de qual canal veio |
| T11 | Pedido com quantidade negativa | POST /pedidos | Logado como Maria | quantidade -2 | 422, erro em itens[0].quantidade | T11 - Pedido com quantidade negativa |
| T12 | Cliente usa o canal BALCAO | POST /pedidos | Logado como Maria | canalPedido BALCAO | 403 CANAL_NAO_PERMITIDO | T12 - Maria tenta fazer pedido como se fosse o balcão |
| T13 | Pedido válido | POST /pedidos | Logado como Maria | 2 tapiocas + 1 suco, TOTEM | 201, AGUARDANDO_PAGAMENTO, total 47.70 | T13 - Maria pede 2 tapiocas e 1 suco no totem |
| T14 | Produto inexistente | POST /pedidos | Logado como Maria | produtoId 9999 | 404 PRODUTO_NAO_ENCONTRADO | T14 - Pedido de um produto que não existe |
| T15 | Unidade inexistente | POST /pedidos | Logado como Maria | unidadeId 999 | 404 UNIDADE_NAO_ENCONTRADA | T15 - Pedido numa loja que não existe |
| T16 | Estoque insuficiente | POST /pedidos | Só 1 cartola em estoque | 3 cartolas | 409 ESTOQUE_INSUFICIENTE | T16 - Maria pede 3 cartolas, mas só tem 1 |
| T17 | Filtrar pedidos por canal | GET /pedidos?canalPedido=TOTEM | T13 feito | - | 200, só pedidos do TOTEM | T17 - Maria filtra só os pedidos feitos no totem |
| T18 | Ver pedido de outro cliente | GET /pedidos/{id} | Logado como José | id do pedido da Maria | 404 | T18 - José tenta ver o pedido da Maria |
| T19 | Pagamento recusado | POST /pagamentos | Pedido do T13 | cenarioMock RECUSAR | 201, pagamento RECUSADO, pedido PAGAMENTO_RECUSADO | T19 - O cartão da Maria é recusado |
| T20 | Gateway fora do ar | POST /pagamentos | Pedido recusado | cenarioMock FALHA_COMUNICACAO | 503, pedido não muda | T20 - O sistema de pagamento sai do ar |
| T21 | Pagamento aprovado | POST /pagamentos | Pedido recusado | cenarioMock APROVAR | 201, pedido PAGO, 47 pontos | T21 - Maria paga e o pagamento é aprovado |
| T22 | Pagamento enviado duas vezes | POST /pagamentos | T21 feito | mesma Idempotency-Key | 200, não cobra de novo | T22 - O app manda o mesmo pagamento duas vezes |
| T23 | Pagar pedido já pago | POST /pagamentos | Pedido PAGO | - | 409 PEDIDO_JA_PAGO | T23 - Tentar pagar um pedido que já foi pago |
| T24 | Cliente muda o status | PATCH /pedidos/{id}/status | Logado como Maria | EM_PREPARO | 403 | T24 - Maria tenta marcar o próprio pedido como em preparo |
| T25 | Pular etapa do status | PATCH /pedidos/{id}/status | Pedido PAGO, logado como cozinha | ENTREGUE | 409 TRANSICAO_STATUS_INVALIDA | T25 - Cozinha tenta pular direto para entregue |
| T26 | Pedido até a entrega | PATCH /pedidos/{id}/status | Pedido PAGO | EM_PREPARO, PRONTO, ENTREGUE | 200 em cada etapa | T26a, T26b e T26c |
| T27 | Auditoria das mudanças | GET /auditoria | T26 feito, logado como admin | filtro pelo pedido | 200, 3 registros | T27 - Admin confere quem mexeu no pedido |
| T28 | Pedido no balcão cancelado | POST /pedidos, /pagamentos, /pedidos/{id}/cancelar | Logado como atendente | 2 cuscuz pelo BALCAO | Cancelado, pagamento estornado, estoque devolvido | T28a a T28d |
| T29 | Dados e pontos da Maria; José sem consentimento | GET /usuarios/me, /fidelidade/saldo, POST /pedidos | - | José com pontosResgate | Sem senha na resposta, saldo 247; José recebe 409 | T29a a T29c |
| T30 | Gerente consulta cliente | GET /usuarios/6, GET /auditoria | Logado como gerente | - | E-mail e telefone mascarados; consulta registrada | T30a e T30b |

O que o roteiro pede no item 8.3 e onde está:

- Login, acesso sem token e perfil sem permissão: T01, T09, T06, T12 e T24
- Campo obrigatório faltando e formato inválido: T10, T03 e T11
- Pedido criado, produto ou unidade inexistente, estoque insuficiente: T13, T14, T15 e T16
- Pagamento aprovado e recusado: T21 e T19
- Auditoria: T27 e T30
