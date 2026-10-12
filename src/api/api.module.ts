import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApplicationModule } from '../application/application.module';
import { AuditoriaController, HealthController } from './auditoria/auditoria.controller';
import { AutenticacaoGuard } from './auth/autenticacao.guard';
import { PerfisGuard } from './auth/perfis.guard';
import { ProdutosController } from './catalogo/produtos.controller';
import { UnidadesController } from './catalogo/unidades.controller';
import { ExcecaoFilter } from './common/excecao.filter';
import { EstoqueController } from './estoque/estoque.controller';
import { FidelidadeController } from './fidelidade/fidelidade.controller';
import { PagamentosController } from './pagamentos/pagamentos.controller';
import { PedidosController } from './pedidos/pedidos.controller';
import { AuthController } from './usuarios/auth.controller';
import { UsuariosController } from './usuarios/usuarios.controller';

@Module({
  imports: [
    ApplicationModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_POR_MINUTO ?? 300) }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    UsuariosController,
    UnidadesController,
    ProdutosController,
    EstoqueController,
    PedidosController,
    PagamentosController,
    FidelidadeController,
    AuditoriaController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ExcecaoFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },
  ],
})
export class ApiModule {}
