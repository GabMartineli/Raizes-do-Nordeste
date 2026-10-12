import { AcessoNegadoError } from '../shared/errors';
import { CanalPedido, Perfil } from '../shared/enums';

const CANAIS_POR_PERFIL: Record<Perfil, CanalPedido[]> = {
  [Perfil.CLIENTE]: [CanalPedido.APP, CanalPedido.TOTEM, CanalPedido.WEB, CanalPedido.PICKUP],
  [Perfil.ATENDENTE]: [CanalPedido.BALCAO],
  [Perfil.GERENTE]: [CanalPedido.BALCAO],
  [Perfil.ADMIN]: [CanalPedido.BALCAO],
  [Perfil.COZINHA]: [],
};

export function validarCanalParaPerfil(canal: CanalPedido, perfil: Perfil): void {
  const permitidos = CANAIS_POR_PERFIL[perfil];
  if (!permitidos.includes(canal)) {
    const lista = permitidos.length ? permitidos.join(', ') : 'nenhum';
    throw new AcessoNegadoError(
      `O perfil ${perfil} não pode abrir pedidos pelo canal ${canal}. Canais permitidos: ${lista}.`,
      'CANAL_NAO_PERMITIDO',
    );
  }
}
