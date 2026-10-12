import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DetalheErroDto {
  @ApiPropertyOptional({ example: 'itens[0].quantidade' })
  field?: string;

  @ApiProperty({ example: 'Disponível: 1' })
  issue: string;
}

export class ErroRespostaDto {
  @ApiProperty({ example: 'ESTOQUE_INSUFICIENTE', description: 'Código estável do erro (para tratamento no front-end)' })
  error: string;

  @ApiProperty({ example: 'Não há quantidade suficiente para um ou mais itens.' })
  message: string;

  @ApiProperty({ type: [DetalheErroDto] })
  details: DetalheErroDto[];

  @ApiProperty({ example: '2026-10-04T12:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/pedidos' })
  path: string;

  @ApiProperty({ example: '6f1c2b8e-3d4a-4b6e-9a51-2f7c8d9e0a1b', description: 'Correlaciona a resposta com os logs do servidor' })
  requestId: string;
}
