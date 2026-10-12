import { Perfil } from './enums';

export interface UsuarioAutenticado {
  id: number;
  email: string;
  perfil: Perfil;
  unidadeId: number | null;
}

export interface ContextoRequisicao {
  usuario: UsuarioAutenticado;
  ip?: string;
  requestId?: string;
}
