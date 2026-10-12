import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Pagamento } from '@prisma/client';
import { CanalPedido, FormaPagamento, StatusPagamento, StatusPedido } from '../../domain/shared/enums';
import { centavosParaReais } from '../../domain/shared/dinheiro';
import { STATUS_OPERACIONAIS } from '../../domain/pedido/status-pedido.rules';
import { PedidoCompleto } from '../../application/pedidos/pedidos.service';
import { PaginacaoQueryDto } from '../common/paginacao.dto';

export class ItemPedidoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'produtoId deve ser um número inteiro' })
  @IsPositive({ message: 'produtoId deve ser positivo' })
  produtoId: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 50 })
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser no mínimo 1' })
  @Max(50, { message: 'quantidade deve ser no máximo 50 por item' })
  quantidade: number;
}

export class CriarPedidoDto {
  @ApiProperty({
    enum: CanalPedido,
    example: CanalPedido.TOTEM,
    description: 'Canal de origem (obrigatório). BALCAO é exclusivo de funcionários; os demais, de clientes.',
  })
  @IsNotEmpty({ message: 'canalPedido é obrigatório' })
  @IsEnum(CanalPedido, { message: `canalPedido deve ser um de: ${Object.values(CanalPedido).join(', ')}` })
  canalPedido: CanalPedido;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'unidadeId deve ser um número inteiro' })
  @IsPositive({ message: 'unidadeId deve ser positivo' })
  unidadeId: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Somente para pedidos de BALCAO: identifica o cliente (opcional). Para clientes é ignorado: o pedido é sempre do próprio usuário.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  clienteId?: number;

  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray({ message: 'itens deve ser uma lista' })
  @ArrayMinSize(1, { message: 'o pedido precisa ter ao menos 1 item' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  itens: ItemPedidoDto[];

  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX })
  @IsEnum(FormaPagamento, { message: `formaPagamento deve ser um de: ${Object.values(FormaPagamento).join(', ')}` })
  formaPagamento: FormaPagamento;

  @ApiPropertyOptional({ example: 0, description: 'Pontos de fidelidade a usar como desconto (10 pontos = R$ 1,00; máx. 50% do subtotal)' })
  @IsOptional()
  @IsInt({ message: 'pontosResgate deve ser um número inteiro' })
  @Min(0, { message: 'pontosResgate não pode ser negativo' })
  pontosResgate?: number;

  @ApiPropertyOptional({ example: 'Sem cebola, por favor' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}

export class FiltroPedidosQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: CanalPedido, example: CanalPedido.TOTEM })
  @IsOptional()
  @IsEnum(CanalPedido, { message: `canalPedido deve ser um de: ${Object.values(CanalPedido).join(', ')}` })
  canalPedido?: CanalPedido;

  @ApiPropertyOptional({ enum: StatusPedido, example: StatusPedido.AGUARDANDO_PAGAMENTO })
  @IsOptional()
  @IsEnum(StatusPedido, { message: 'status inválido' })
  status?: StatusPedido;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unidadeId?: number;
}

export class ResumoCanaisQueryDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unidadeId?: number;
}

export class AtualizarStatusDto {
  @ApiProperty({ enum: STATUS_OPERACIONAIS, example: StatusPedido.EM_PREPARO, description: 'PAGO → EM_PREPARO → PRONTO → ENTREGUE' })
  @IsIn(STATUS_OPERACIONAIS as readonly string[], { message: `status deve ser um de: ${STATUS_OPERACIONAIS.join(', ')}` })
  status: StatusPedido;
}

export class CancelarPedidoDto {
  @ApiProperty({ example: 'Cliente desistiu da compra' })
  @IsString()
  @IsNotEmpty({ message: 'motivo é obrigatório' })
  @MaxLength(200)
  motivo: string;
}

export class ItemPedidoRespostaDto {
  @ApiProperty({ example: 1 }) produtoId: number;
  @ApiProperty({ example: 'Tapioca de carne de sol com queijo coalho' }) nome: string;
  @ApiProperty({ example: 2 }) quantidade: number;
  @ApiProperty({ example: 18.9 }) precoUnitario: number;
  @ApiProperty({ example: 37.8 }) subtotal: number;
}

export class PagamentoResumoDto {
  @ApiProperty({ example: 7 }) id: number;
  @ApiProperty({ enum: StatusPagamento, example: StatusPagamento.APROVADO }) status: string;
  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX }) forma: string;
  @ApiProperty({ example: 49.7 }) valor: number;
  @ApiPropertyOptional({ example: 'mock_2b1d...', nullable: true }) transacaoExterna: string | null;
  @ApiPropertyOptional({ example: null, nullable: true }) motivo: string | null;
  @ApiProperty() createdAt: Date;
}

export class PedidoRespostaDto {
  @ApiProperty({ example: 9001 }) id: number;
  @ApiProperty({ enum: StatusPedido, example: StatusPedido.AGUARDANDO_PAGAMENTO }) status: string;
  @ApiProperty({ enum: CanalPedido, example: CanalPedido.TOTEM }) canalPedido: string;
  @ApiProperty({ example: 2 }) unidadeId: number;
  @ApiPropertyOptional({ example: 5, nullable: true }) clienteId: number | null;
  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX }) formaPagamento: string;
  @ApiProperty({ type: [ItemPedidoRespostaDto] }) itens: ItemPedidoRespostaDto[];
  @ApiProperty({ example: 49.7 }) subtotal: number;
  @ApiProperty({ example: 0 }) desconto: number;
  @ApiProperty({ example: 0 }) pontosResgatados: number;
  @ApiProperty({ example: 49.7 }) total: number;
  @ApiPropertyOptional({ nullable: true }) observacao: string | null;
  @ApiPropertyOptional({ nullable: true }) motivoCancelamento: string | null;
  @ApiProperty({ type: [PagamentoResumoDto] }) pagamentos: PagamentoResumoDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export function apresentarPagamento(p: Pagamento): PagamentoResumoDto {
  return {
    id: p.id,
    status: p.status,
    forma: p.forma,
    valor: centavosParaReais(p.valorCentavos),
    transacaoExterna: p.transacaoExterna,
    motivo: p.motivo,
    createdAt: p.createdAt,
  };
}

export function apresentarPedido(p: PedidoCompleto): PedidoRespostaDto {
  return {
    id: p.id,
    status: p.status,
    canalPedido: p.canalPedido,
    unidadeId: p.unidadeId,
    clienteId: p.clienteId,
    formaPagamento: p.formaPagamento,
    itens: p.itens.map((i) => ({
      produtoId: i.produtoId,
      nome: i.produto.nome,
      quantidade: i.quantidade,
      precoUnitario: centavosParaReais(i.precoUnitarioCentavos),
      subtotal: centavosParaReais(i.subtotalCentavos),
    })),
    subtotal: centavosParaReais(p.subtotalCentavos),
    desconto: centavosParaReais(p.descontoCentavos),
    pontosResgatados: p.pontosResgatados,
    total: centavosParaReais(p.totalCentavos),
    observacao: p.observacao,
    motivoCancelamento: p.motivoCancelamento,
    pagamentos: p.pagamentos.map(apresentarPagamento),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
