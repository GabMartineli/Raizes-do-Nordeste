import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NaoAutenticadoError } from '../../domain/shared/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TokenService } from '../../infrastructure/seguranca/token.service';
import { CHAVE_PUBLICO, RequisicaoAutenticada } from './decorators';

@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, [contexto.getHandler(), contexto.getClass()]);
    if (publica) return true;

    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new NaoAutenticadoError('TOKEN_AUSENTE', 'Envie o token de acesso no cabeçalho Authorization: Bearer <token>.');
    }
    const payload = this.tokens.verificar(token);
    if (!payload) throw new NaoAutenticadoError('TOKEN_INVALIDO', 'Token inválido ou expirado. Faça login novamente.');

    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) throw new NaoAutenticadoError('TOKEN_INVALIDO', 'Usuário inativo ou inexistente.');

    req.usuario = { id: usuario.id, email: usuario.email, perfil: usuario.perfil, unidadeId: usuario.unidadeId };
    return true;
  }
}
