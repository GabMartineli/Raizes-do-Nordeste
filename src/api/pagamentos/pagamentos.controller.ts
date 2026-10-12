import { Body, Controller, Get, Headers, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { Response } from 'express';
import { PagamentosService } from '../../application/pagamentos/pagamentos.service';
import { FormaPagamento, StatusPedido } from '../../domain/shared/enums';
import { CenarioMock } from '../../domain/pagamento/gateway-pagamento.port';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { Contexto } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { ParseIdPipe } from '../common/validacao';
import { apresentarPagamento, PagamentoResumoDto } from '../pedidos/pedidos.dto';

export class SolicitarPagamentoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'pedidoId deve ser um número inteiro' })
  @IsPositive()
  pedidoId: number;

  @ApiPropertyOptional({ enum: FormaPagamento, example: FormaPagamento.PIX, description: 'Padrão: a forma escolhida no pedido' })
  @IsOptional()
  @IsEnum(FormaPagamento, { message: 'formaPagamento inválida' })
  formaPagamento?: FormaPagamento;

  @ApiPropertyOptional({
    enum: CenarioMock,
    example: CenarioMock.APROVAR,
    description:
      'Somente para o mock: força o resultado. Sem este campo, valores acima de R$ 500,00 são recusados e os demais aprovados.',
  })
  @IsOptional()
  @IsEnum(CenarioMock, { message: `cenarioMock deve ser um de: ${Object.values(CenarioMock).join(', ')}` })
  cenarioMock?: CenarioMock;
}

export class ResultadoPagamentoDto {
  @ApiProperty({ type: PagamentoResumoDto }) pagamento: PagamentoResumoDto;
  @ApiProperty({ example: 1 }) pedidoId: number;
  @ApiProperty({ enum: StatusPedido, example: StatusPedido.PAGO }) statusPedido: string;
  @ApiProperty({ example: 49, description: 'Pontos de fidelidade creditados (se houver consentimento)' }) pontosAcumulados: number;
  @ApiProperty({ example: 'Pagamento aprovado. O pedido foi enviado para a cozinha.' }) mensagem: string;
}

@ApiTags('Pagamentos')
@ApiBearerAuth()
@Controller('pagamentos')
export class PagamentosController {
  constructor(private readonly pagamentos: PagamentosService) {}

  @Post()
  @ApiOperation({
    summary: 'Solicitar pagamento ao gateway externo (mock)',
    description:
      'Envia a cobrança ao provedor simulado e aplica o retorno ao pedido: APROVADO → pedido PAGO; RECUSADO → pedido PAGAMENTO_RECUSADO (pode tentar de novo). ' +
      'Falha de comunicação → 503, pedido inalterado. Repetir com a mesma Idempotency-Key devolve o mesmo resultado (200) sem nova cobrança.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Identificador único da tentativa (recomendado: UUID)' })
  @ApiCreatedResponse({ type: ResultadoPagamentoDto, description: 'Pagamento processado (aprovado ou recusado)' })
  @ApiOkResponse({ type: ResultadoPagamentoDto, description: 'Requisição repetida (idempotente)' })
  @ApiErros(401, 404, 409, 422, 503)
  async solicitar(
    @Body() dto: SolicitarPagamentoDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Contexto() ctx: ContextoRequisicao,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResultadoPagamentoDto> {
    const resultado = await this.pagamentos.solicitar(dto, idempotencyKey, ctx);
    res.status(resultado.reaproveitado ? 200 : 201);
    if (resultado.reaproveitado) res.setHeader('Idempotent-Replayed', 'true');
    return {
      pagamento: apresentarPagamento(resultado.pagamento),
      pedidoId: resultado.pagamento.pedidoId,
      statusPedido: resultado.statusPedido,
      pontosAcumulados: resultado.pontosAcumulados,
      mensagem: resultado.mensagem,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pagamento (inclui o payload de retorno do gateway)' })
  @ApiErros(401, 403, 404, 422)
  async obter(@Param('id', ParseIdPipe) id: number, @Contexto() ctx: ContextoRequisicao) {
    const pagamento = await this.pagamentos.obter(id, ctx);
    return {
      ...apresentarPagamento(pagamento),
      pedidoId: pagamento.pedidoId,
      retornoGateway: pagamento.payloadRetorno ? JSON.parse(pagamento.payloadRetorno) : null,
    };
  }
}
