*USADO IA PARA CORRIGIR ERROS DE PORTUGUÊS E DEIXAR MAIS FACIL DE ENTENDER*

# Escopo e requisitos

## Contexto

A Raízes do Nordeste é uma rede de lanchonetes de comida regional, com a matriz em Recife e filiais em outras capitais. Cada loja tem cardápio, preços e estoque próprios, e os pedidos chegam por vários canais: aplicativo, totem, balcão, retirada (pickup) e site.

A ideia da API é juntar os pedidos de todos os canais num lugar só, sabendo de qual canal e de qual loja veio cada um, controlar o estoque de cada loja para não vender o que acabou, integrar um serviço de pagamento (simulado), manter um programa de pontos e cumprir o básico da LGPD.

## Requisitos funcionais

| ID | Requisito | Situação |
|---|---|---|
| RF01 | Cadastro de cliente e login com JWT | Feito |
| RF02 | Perfis (cliente, atendente, cozinha, gerente, admin) com permissões diferentes | Feito |
| RF03 | Cadastro de funcionários ligados a uma unidade | Feito |
| RF04 | Cadastro e consulta de unidades | Feito |
| RF05 | Cardápio por unidade, com preço próprio | Feito |
| RF06 | Catálogo de produtos | Feito |
| RF07 | Criar pedido com itens, valores e status | Feito |
| RF08 | Registrar o canal do pedido (`canalPedido`) e filtrar por canal | Feito |
| RF09 | Atualizar o status do pedido (preparo, pronto, entregue) | Feito |
| RF10 | Cancelar pedido, devolvendo estoque e estornando o pagamento | Feito |
| RF11 | Controle de estoque por unidade (entrada e saída), sem vender o que não tem | Feito |
| RF12 | Pagamento por serviço externo (mock), guardando o retorno | Feito |
| RF13 | Programa de pontos (acúmulo e resgate), só com consentimento | Feito |
| RF14 | Usuário consultar, corrigir e excluir os próprios dados | Feito |
| RF15 | Consulta da auditoria | Feito |
| RF16 | Promoções e campanhas | Só documentado (ver abaixo) |

## Requisitos não funcionais

| ID | Requisito | Como foi feito |
|---|---|---|
| RNF01 | Autenticação | Token JWT com validade de 1 hora. A cada requisição, o sistema confere se o usuário ainda está ativo. |
| RNF02 | Senhas | Guardadas com hash bcrypt. Mínimo de 8 caracteres, com letras e números. |
| RNF03 | Controle de acesso | Cada rota define os perfis que podem acessá-la. Funcionário só mexe na própria loja e cliente só vê os próprios pedidos. |
| RNF04 | Proteção contra abuso | Limite de requisições por IP, mais rígido no login. |
| RNF05 | LGPD | Ver a seção abaixo. |
| RNF06 | Logs e auditoria | Tabela `audit_logs` com as ações importantes. Cada resposta tem um `X-Request-Id` para cruzar com os logs. |
| RNF07 | Horário de pico | Baixa de estoque que nunca deixa saldo negativo, índices nas colunas mais filtradas e paginação nas listagens. |
| RNF08 | Consistência | Criar o pedido, baixar o estoque e registrar a auditoria acontecem numa mesma transação. |
| RNF09 | Falhas no pagamento | Timeout de 5 segundos. Se o gateway falhar, a tentativa fica registrada e o pedido continua podendo ser pago. Pagamento repetido com a mesma `Idempotency-Key` não cobra de novo. |
| RNF10 | Documentação | Swagger gerado a partir do código, em `/docs`. |
| RNF11 | Padrão de erro | Todo erro volta no formato `{ error, message, details, timestamp, path, requestId }`. |

## LGPD

Dados pessoais que o sistema guarda, e para quê:

- Nome e e-mail: identificar o cliente e permitir o login (base legal: execução de contrato).
- Senha: só o hash, nunca o texto. Também nunca aparece nas respostas da API.
- Telefone: opcional, para contato sobre o pedido.
- Histórico de pedidos: necessário para o serviço e por obrigação fiscal.
- Pontos de fidelidade: só existem se o cliente aceitar o programa (base legal: consentimento).
- IP na auditoria: segurança (legítimo interesse).

Na prática:

- O consentimento do programa de pontos fica gravado na tabela `consentimentos`, com a data e a versão do termo. Sem ele, o cliente não acumula nem usa pontos. Dá para revogar a qualquer momento em `DELETE /fidelidade/consentimento`.
- O cliente pode ver os próprios dados (`GET /usuarios/me`), corrigir (`PATCH /usuarios/me`) e excluir a conta (`DELETE /usuarios/me`).
- Na exclusão, os dados pessoais são anonimizados em vez de apagados, porque os pedidos precisam continuar existindo por causa da parte fiscal. Não dá para excluir com pedido em andamento.
- Quando um gerente consulta os dados de um cliente, e-mail e telefone aparecem mascarados e essa consulta fica registrada na auditoria.
- A auditoria não guarda senha, token nem dados pessoais completos.
- Ficou como proposta (não implementado): anonimizar automaticamente contas paradas há mais de 2 anos e manter os logs por 5 anos.

## Promoções (só documentado)

Não deu tempo de implementar, mas a ideia seria:

- Criar uma tabela `campanhas` com nome, tipo (porcentagem, valor fixo ou "leve X pague Y"), valor, período de validade e, opcionalmente, canais, unidades e produtos onde vale.
- Na hora de calcular o pedido, buscar as campanhas ativas para aquela data, canal e loja, aplicar a mais vantajosa em cada item (sem acumular) e só depois aplicar o desconto de pontos.
- Exemplo de uso: "10% de desconto no totem às terças", para incentivar o autoatendimento. O relatório de pedidos por canal mostraria se funcionou.

## O que foi priorizado

O roteiro pede um fluxo completo e testável. Escolhi o fluxo Pedido → Pagamento → Status porque ele envolve quase tudo o que é avaliado: canal do pedido, integração com pagamento, estoque, mudança de status e auditoria. Para ele funcionar direito, precisei fazer também o controle de estoque por loja.

Ficaram de fora:

- Promoções, que estão só documentadas acima.
- Refresh token e logout. O token expira em 1 hora e o sistema confere se o usuário continua ativo.
- Gateway de pagamento real. O roteiro pede mock, mas o código usa uma interface (`GatewayPagamento`), então daria para trocar depois.
- PostgreSQL. Usei SQLite para ficar fácil de rodar na correção. Com o Prisma, a troca é só mudar o `provider`.
