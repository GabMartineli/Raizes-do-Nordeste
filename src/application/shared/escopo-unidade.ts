import { AcessoNegadoError } from '../../domain/shared/errors';
import { Perfil } from '../../domain/shared/enums';
import { UsuarioAutenticado } from '../../domain/shared/usuario-autenticado';

export function ehFuncionarioDeUnidade(usuario: UsuarioAutenticado): boolean {
  return usuario.perfil !== Perfil.CLIENTE && usuario.perfil !== Perfil.ADMIN && usuario.unidadeId !== null;
}

export function garantirAcessoAUnidade(usuario: UsuarioAutenticado, unidadeId: number): void {
  if (ehFuncionarioDeUnidade(usuario) && usuario.unidadeId !== unidadeId) {
    throw new AcessoNegadoError('Você só pode operar dados da sua própria unidade.');
  }
}

export function resolverUnidadeDoFiltro(usuario: UsuarioAutenticado, unidadeIdFiltro?: number): number | undefined {
  if (!ehFuncionarioDeUnidade(usuario)) return unidadeIdFiltro;
  if (unidadeIdFiltro !== undefined) garantirAcessoAUnidade(usuario, unidadeIdFiltro);
  return usuario.unidadeId ?? undefined;
}
