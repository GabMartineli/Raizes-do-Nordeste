import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GATEWAY_PAGAMENTO } from '../domain/pagamento/gateway-pagamento.port';
import { PrismaService } from './database/prisma.service';
import { GatewayPagamentoMock } from './pagamento/gateway-pagamento.mock';
import { SenhaService } from './seguranca/senha.service';
import { TokenService } from './seguranca/token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET não configurado. Copie .env.example para .env.');
        return { secret };
      },
    }),
  ],
  providers: [
    PrismaService,
    SenhaService,
    TokenService,
    { provide: GATEWAY_PAGAMENTO, useClass: GatewayPagamentoMock },
  ],
  exports: [PrismaService, SenhaService, TokenService, GATEWAY_PAGAMENTO],
})
export class InfrastructureModule {}
