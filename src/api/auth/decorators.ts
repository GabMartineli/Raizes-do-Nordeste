import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { Perfil } from '../../domain/shared/enums';
import { ContextoRequisicao, UsuarioAutenticado } from '../../domain/shared/usuario-autenticado';

export const CHAVE_PUBLICO = 'rota_publica';
export const CHAVE_PERFIS = 'perfis_permitidos';

export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

export const Perfis = (...perfis: Perfil[]) => SetMetadata(CHAVE_PERFIS, perfis);

export type RequisicaoAutenticada = Request & { usuario?: UsuarioAutenticado; requestId?: string };

export const Contexto = createParamDecorator((_: unknown, ctx: ExecutionContext): ContextoRequisicao => {
  const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
  return { usuario: req.usuario!, ip: req.ip, requestId: req.requestId };
});

export const Metadados = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
  return { ip: req.ip, requestId: req.requestId };
});
