import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErroRespostaDto } from './erro-resposta.dto';

const DESCRICOES: Record<number, string> = {
  400: 'Requisição malformada',
  401: 'Não autenticado (token ausente, inválido ou expirado)',
  403: 'Sem permissão para o perfil ou unidade',
  404: 'Recurso não encontrado',
  409: 'Conflito com regra de negócio',
  422: 'Erro de validação dos dados enviados',
  429: 'Muitas requisições',
  503: 'Serviço externo indisponível',
};

export function ApiErros(...status: number[]) {
  return applyDecorators(
    ...status.map((s) => ApiResponse({ status: s, description: DESCRICOES[s] ?? 'Erro', type: ErroRespostaDto })),
  );
}
