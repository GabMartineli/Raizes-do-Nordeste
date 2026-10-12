# DER — Modelo de Dados

Banco SQLite, usando o Prisma. O DER é o mesmo do arquivo prisma/schema.prisma.

```mermaid
erDiagram
    UNIDADES ||--o{ USUARIOS : "lota (funcionários)"
    UNIDADES ||--o{ CARDAPIO_ITENS : "oferece"
    PRODUTOS ||--o{ CARDAPIO_ITENS : "é ofertado em"
    UNIDADES ||--o{ ESTOQUES : "possui estoque próprio"
    PRODUTOS ||--o{ ESTOQUES : "é estocado em"
    ESTOQUES ||--o{ MOVIMENTACOES_ESTOQUE : "registra"
    UNIDADES ||--o{ PEDIDOS : "recebe"
    USUARIOS |o--o{ PEDIDOS : "cliente de"
    USUARIOS |o--o{ PEDIDOS : "operador de (balcão)"
    PEDIDOS ||--|{ ITENS_PEDIDO : "contém"
    PRODUTOS ||--o{ ITENS_PEDIDO : "é vendido em"
    PEDIDOS ||--o{ PAGAMENTOS : "tentativas"
    PEDIDOS |o--o{ MOVIMENTACOES_ESTOQUE : "origina"
    USUARIOS ||--o| CONTAS_FIDELIDADE : "possui"
    CONTAS_FIDELIDADE ||--o{ TRANSACOES_PONTOS : "registra"
    PEDIDOS |o--o{ TRANSACOES_PONTOS : "origina"
    USUARIOS ||--o{ CONSENTIMENTOS : "concede"
    USUARIOS |o--o{ AUDIT_LOGS : "executa"

    UNIDADES {
        int id PK
        string nome
        enum tipo "MATRIZ | FILIAL"
        string cidade
        string uf
        string endereco
        boolean ativa
    }
    USUARIOS {
        int id PK
        string nome
        string email UK
        string senhaHash "bcrypt"
        string telefone "opcional"
        enum perfil "CLIENTE | ATENDENTE | COZINHA | GERENTE | ADMIN"
        int unidadeId FK "nulo para cliente/admin"
        boolean ativo
        datetime anonimizadoEm "LGPD"
    }
    PRODUTOS {
        int id PK
        string nome
        string descricao
        string categoria
        boolean ativo
    }
    CARDAPIO_ITENS {
        int id PK
        int unidadeId FK "UK(unidadeId, produtoId)"
        int produtoId FK
        int precoCentavos "preço por unidade"
        boolean disponivel
    }
    ESTOQUES {
        int id PK
        int unidadeId FK "UK(unidadeId, produtoId)"
        int produtoId FK
        int quantidade "nunca negativa"
    }
    MOVIMENTACOES_ESTOQUE {
        int id PK
        int estoqueId FK
        enum tipo "ENTRADA | SAIDA"
        int quantidade
        string motivo
        int pedidoId FK "opcional"
        int usuarioId FK "opcional"
    }
    PEDIDOS {
        int id PK
        int clienteId FK "opcional (balcão anônimo)"
        int operadorId FK "funcionário que registrou"
        int unidadeId FK
        enum canalPedido "APP | TOTEM | BALCAO | PICKUP | WEB"
        enum status "AGUARDANDO_PAGAMENTO ... CANCELADO"
        enum formaPagamento
        int subtotalCentavos
        int descontoCentavos
        int totalCentavos
        int pontosResgatados
        string motivoCancelamento
    }
    ITENS_PEDIDO {
        int id PK
        int pedidoId FK
        int produtoId FK
        int quantidade
        int precoUnitarioCentavos "congelado na venda"
        int subtotalCentavos
    }
    PAGAMENTOS {
        int id PK
        int pedidoId FK
        string idempotencyKey UK
        enum forma
        int valorCentavos
        enum status "APROVADO | RECUSADO | ERRO | ESTORNADO"
        string transacaoExterna "id do gateway"
        string payloadEnvio "JSON"
        string payloadRetorno "JSON"
    }
    CONTAS_FIDELIDADE {
        int id PK
        int usuarioId FK,UK
        int saldoPontos
    }
    TRANSACOES_PONTOS {
        int id PK
        int contaId FK
        enum tipo "ACUMULO | RESGATE | ESTORNO"
        int pontos "positivo ou negativo"
        int pedidoId FK "opcional"
    }
    CONSENTIMENTOS {
        int id PK
        int usuarioId FK
        enum finalidade "FIDELIDADE | MARKETING"
        string versaoTermo
        datetime concedidoEm
        datetime revogadoEm
    }
    AUDIT_LOGS {
        int id PK
        int usuarioId FK "opcional"
        string acao
        string entidade
        string entidadeId
        string detalhes "JSON sem dados sensíveis"
        string ip
        string requestId
        datetime createdAt
    }
```

## Restrições

- Cada unidade tem uma linha de preço e um saldo de estoque por produto (unique em unidadeId + produtoId).
- E-mail único por usuário.
- A Idempotency-Key do pagamento é única, para não cobrar a mesma tentativa duas vezes.
- Cada cliente tem no máximo uma conta de pontos.
- O estoque e o saldo de pontos nunca ficam negativos. Isso é garantido no update, que só baixa se tiver saldo.
- O pagamento fica numa tabela separada do pedido (um pedido pode ter várias tentativas).
- O preço do item fica gravado no pedido, então mudar o cardápio não altera pedidos antigos.
- Valores em centavos (inteiro).
- Índices em pedidos por canal, status e unidade, que são os filtros mais usados.
