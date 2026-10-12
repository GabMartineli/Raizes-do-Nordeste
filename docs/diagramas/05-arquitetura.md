# Arquitetura em camadas

O projeto é dividido em quatro camadas. O domínio não depende de NestJS, HTTP nem Prisma.

```mermaid
flowchart TB
    subgraph Clientes["Canais"]
        APP[App] ~~~ TOTEM[Totem] ~~~ WEB[Web] ~~~ BALCAO[Balcão] ~~~ PICKUP[Pickup]
    end

    subgraph API["src/api — Interface"]
        direction LR
        G["Guards globais<br/>Throttler → JWT → Perfis"]
        CT["Controllers<br/>/auth /usuarios /unidades /produtos<br/>/estoque /pedidos /pagamentos /fidelidade /auditoria"]
        DTO["DTOs + class-validator<br/>Presenters (centavos → reais)"]
        F["ExcecaoFilter<br/>(erro JSON padrão)"]
        SW["Swagger / OpenAPI"]
    end

    subgraph APPL["src/application — Casos de uso"]
        direction LR
        S1[PedidosService] ~~~ S2[PagamentosService] ~~~ S3[EstoqueService]
        S4[FidelidadeService] ~~~ S5[AuthService / UsuariosService] ~~~ S6[AuditoriaService]
    end

    subgraph DOM["src/domain — Regras de negócio puras"]
        direction LR
        R1[status-pedido.rules] ~~~ R2[canal-pedido.rules] ~~~ R3[calculo-pedido]
        R4[fidelidade.rules] ~~~ R5[errors / enums] ~~~ P1[["GatewayPagamento (porta)"]]
    end

    subgraph INFRA["src/infrastructure — Detalhes técnicos"]
        direction LR
        I1[(PrismaService<br/>SQLite)] ~~~ I2[GatewayPagamentoMock] ~~~ I3[SenhaService<br/>bcrypt] ~~~ I4[TokenService<br/>JWT]
    end

    Clientes -->|HTTPS + JSON| API
    API --> APPL
    APPL --> DOM
    APPL --> INFRA
    I2 -. implementa .-> P1
```

- api: controllers, validação dos dados de entrada, autenticação, permissões, Swagger e conversão dos erros para HTTP.
- application: serviços que executam os casos de uso (criar pedido, pagar, mudar status), controlam as transações e gravam a auditoria.
- domain: regras de negócio puras, que dá para testar sem banco (status do pedido, canais, cálculo do pedido, pontos).
- infrastructure: Prisma, o gateway de pagamento simulado, o hash de senha e o JWT.

Algumas decisões:

- O domínio lança erros próprios (RegraNegocioError, NaoEncontradoError etc.) e um filtro na camada api converte esses erros em 409, 404 etc.
- O serviço de pagamento depende de uma interface (GatewayPagamento), e não do mock direto. Para usar um gateway real, bastaria criar outra classe.
- Os serviços usam o Prisma direto, sem uma camada de repositório, para não complicar demais. As regras importantes ficam no domínio e têm testes.
