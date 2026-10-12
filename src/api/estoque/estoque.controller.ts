import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Max, MaxLength } from 'class-validator';
import { Estoque, MovimentacaoEstoque, Produto, Unidade } from '@prisma/client';
import { EstoqueService } from '../../application/estoque/estoque.service';
import { Perfil, TipoMovimentacao } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { Contexto, Perfis } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { PaginacaoQueryDto } from '../common/paginacao.dto';

export class MovimentarEstoqueDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  unidadeId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  produtoId: number;

  @ApiProperty({ enum: TipoMovimentacao, example: TipoMovimentacao.ENTRADA })
  @IsEnum(TipoMovimentacao, { message: 'tipo deve ser ENTRADA ou SAIDA' })
  tipo: TipoMovimentacao;

  @ApiProperty({ example: 20, minimum: 1 })
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @IsPositive({ message: 'quantidade deve ser maior que zero' })
  @Max(100_000)
  quantidade: number;

  @ApiProperty({ example: 'Recebimento do fornecedor - NF 1234' })
  @IsString()
  @IsNotEmpty({ message: 'motivo é obrigatório' })
  @MaxLength(200)
  motivo: string;
}

export class FiltroEstoqueQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ example: 2, description: 'Funcionários de loja só consultam a própria unidade' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unidadeId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  produtoId?: number;
}

export class SaldoEstoqueRespostaDto {
  @ApiProperty({ example: 2 }) unidadeId: number;
  @ApiProperty({ example: 'Raízes do Nordeste - Boa Viagem' }) unidade: string;
  @ApiProperty({ example: 1 }) produtoId: number;
  @ApiProperty({ example: 'Tapioca de carne de sol com queijo coalho' }) produto: string;
  @ApiProperty({ example: 35 }) quantidade: number;
  @ApiProperty() atualizadoEm: Date;
}

export class MovimentacaoRespostaDto {
  @ApiProperty({ example: 15 }) id: number;
  @ApiProperty({ enum: TipoMovimentacao }) tipo: string;
  @ApiProperty({ example: 20 }) quantidade: number;
  @ApiProperty({ example: 'Recebimento do fornecedor - NF 1234' }) motivo: string;
  @ApiPropertyOptional({ nullable: true, example: null }) pedidoId: number | null;
  @ApiProperty() createdAt: Date;
}

export class ResultadoMovimentacaoDto {
  @ApiProperty({ type: MovimentacaoRespostaDto }) movimentacao: MovimentacaoRespostaDto;
  @ApiProperty({ type: SaldoEstoqueRespostaDto }) saldo: SaldoEstoqueRespostaDto;
}

function apresentarSaldo(e: Estoque & { produto: Produto; unidade: Unidade }): SaldoEstoqueRespostaDto {
  return {
    unidadeId: e.unidadeId,
    unidade: e.unidade.nome,
    produtoId: e.produtoId,
    produto: e.produto.nome,
    quantidade: e.quantidade,
    atualizadoEm: e.updatedAt,
  };
}

function apresentarMovimentacao(m: MovimentacaoEstoque): MovimentacaoRespostaDto {
  return { id: m.id, tipo: m.tipo, quantidade: m.quantidade, motivo: m.motivo, pedidoId: m.pedidoId, createdAt: m.createdAt };
}

@ApiTags('Estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(private readonly estoque: EstoqueService) {}

  @Get()
  @Perfis(Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Saldo de estoque por unidade (funcionários)' })
  @ApiOkResponse({ type: [SaldoEstoqueRespostaDto] })
  @ApiErros(401, 403, 422)
  async saldos(@Query() filtro: FiltroEstoqueQueryDto, @Contexto() ctx: ContextoRequisicao) {
    const pagina = await this.estoque.listarSaldos(filtro, ctx);
    return { ...pagina, data: pagina.data.map(apresentarSaldo) };
  }

  @Post('movimentacoes')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Registrar entrada/saída de estoque (GERENTE da unidade/ADMIN)', description: 'Saída sem saldo suficiente retorna 409.' })
  @ApiCreatedResponse({ type: ResultadoMovimentacaoDto })
  @ApiErros(401, 403, 404, 409, 422)
  async movimentar(@Body() dto: MovimentarEstoqueDto, @Contexto() ctx: ContextoRequisicao): Promise<ResultadoMovimentacaoDto> {
    const { movimentacao, estoque } = await this.estoque.movimentar(dto, ctx);
    return { movimentacao: apresentarMovimentacao(movimentacao), saldo: apresentarSaldo(estoque) };
  }

  @Get('movimentacoes')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Histórico de movimentações (GERENTE/ADMIN)' })
  @ApiOkResponse({ type: [MovimentacaoRespostaDto] })
  @ApiErros(401, 403, 422)
  async movimentacoes(@Query() filtro: FiltroEstoqueQueryDto, @Contexto() ctx: ContextoRequisicao) {
    const pagina = await this.estoque.listarMovimentacoes(filtro, ctx);
    return {
      ...pagina,
      data: pagina.data.map((m) => ({ ...apresentarMovimentacao(m), produtoId: m.estoque.produtoId, produto: m.estoque.produto.nome, unidadeId: m.estoque.unidadeId })),
    };
  }
}
