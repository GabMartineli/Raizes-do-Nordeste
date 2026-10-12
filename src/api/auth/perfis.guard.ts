import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcessoNegadoError } from '../../domain/shared/errors';
import { Perfil } from '../../domain/shared/enums';
import { CHAVE_PERFIS, RequisicaoAutenticada } from './decorators';

@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permitidos = this.reflector.getAllAndOverride<Perfil[] | undefined>(CHAVE_PERFIS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!permitidos?.length) return true;

    const { usuario } = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    if (!usuario || !permitidos.includes(usuario.perfil)) {
      throw new AcessoNegadoError(`Acesso restrito aos perfis: ${permitidos.join(', ')}.`);
    }
    return true;
  }
}
