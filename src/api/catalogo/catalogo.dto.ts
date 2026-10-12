import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, Max, MaxLength } from 'class-validator';
import { CardapioItem, Produto, Unidade } from '@prisma/client';
import { centavosParaReais } from '../../domain/shared/dinheiro';
import { PaginacaoQueryDto } from '../common/paginacao.dto';

const paraBooleano = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class CriarUnidadeDto {
  @ApiProperty({ example: 'Raízes do Nordeste - Caruaru' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome: string;

  @ApiProperty({ enum: ['MATRIZ', 'FILIAL'], example: 'FILIAL' })
  @IsIn(['MATRIZ', 'FILIAL'], { message: 'tipo deve ser MATRIZ ou FILIAL' })
  tipo: 'MATRIZ' | 'FILIAL';

  @ApiProperty({ example: 'Caruaru' })
  @IsString()
  @IsNotEmpty()
  cidade: string;

  @ApiProperty({ example: 'PE' })
  @IsString()
  @Length(2, 2, { message: 'uf deve ter 2 letras' })
  uf: string;

  @ApiProperty({ example: 'Av. Agamenon Magalhães, 444' })
  @IsString()
  @IsNotEmpty()
  endereco: string;
}

export class FiltroUnidadesQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ example: 'PE' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  uf?: string;
}

export class UnidadeRespostaDto {
  @ApiProperty({ example: 2 }) id: number;
  @ApiProperty({ example: 'Raízes do Nordeste - Boa Viagem' }) nome: string;
  @ApiProperty({ enum: ['MATRIZ', 'FILIAL'] }) tipo: string;
  @ApiProperty({ example: 'Recife' }) cidade: string;
  @ApiProperty({ example: 'PE' }) uf: string;
  @ApiProperty({ example: 'Av. Boa Viagem, 1000' }) endereco: string;
  @ApiProperty({ example: true }) ativa: boolean;
}

export function apresentarUnidade(u: Unidade): UnidadeRespostaDto {
  return { id: u.id, nome: u.nome, tipo: u.tipo, cidade: u.cidade, uf: u.uf, endereco: u.endereco, ativa: u.ativa };
}

export class CriarProdutoDto {
  @ApiProperty({ example: 'Tapioca de carne de sol com queijo coalho' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome: string;

  @ApiPropertyOptional({ example: 'Tapioca recheada com carne de sol desfiada e queijo coalho' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @ApiProperty({ example: 'TAPIOCAS' })
  @IsString()
  @IsNotEmpty()
  categoria: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class AtualizarProdutoDto extends PartialType(CriarProdutoDto) {}

export class FiltroProdutosQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ example: 'TAPIOCAS' })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional({ example: 'cuscuz', description: 'Busca por parte do nome' })
  @IsOptional()
  @IsString()
  busca?: string;
}

export class ProdutoRespostaDto {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'Tapioca de carne de sol com queijo coalho' }) nome: string;
  @ApiPropertyOptional({ nullable: true }) descricao: string | null;
  @ApiProperty({ example: 'TAPIOCAS' }) categoria: string;
  @ApiProperty({ example: true }) ativo: boolean;
}

export function apresentarProduto(p: Produto): ProdutoRespostaDto {
  return { id: p.id, nome: p.nome, descricao: p.descricao, categoria: p.categoria, ativo: p.ativo };
}

export class DefinirItemCardapioDto {
  @ApiProperty({ example: 18.9, description: 'Preço em reais nesta unidade' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'preco deve ter no máximo 2 casas decimais' })
  @IsPositive({ message: 'preco deve ser maior que zero' })
  @Max(10_000)
  preco: number;

  @ApiPropertyOptional({ example: true, description: 'false retira o item do cardápio da unidade' })
  @IsOptional()
  @IsBoolean()
  disponivel?: boolean;
}

export class FiltroCardapioQueryDto {
  @ApiPropertyOptional({ example: 'TAPIOCAS' })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional({ example: true, description: 'Somente itens vendáveis agora (habilitados e com estoque)' })
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean()
  somenteDisponiveis?: boolean;
}

export class ItemCardapioRespostaDto {
  @ApiProperty({ example: 1 }) produtoId: number;
  @ApiProperty({ example: 'Tapioca de carne de sol com queijo coalho' }) nome: string;
  @ApiPropertyOptional({ nullable: true }) descricao: string | null;
  @ApiProperty({ example: 'TAPIOCAS' }) categoria: string;
  @ApiProperty({ example: 18.9 }) preco: number;
  @ApiProperty({ example: true, description: 'Habilitado no cardápio e com saldo em estoque' }) disponivel: boolean;
}

export function apresentarItemCardapio(r: {
  item: CardapioItem & { produto: Produto };
  disponivel: boolean;
}): ItemCardapioRespostaDto {
  return {
    produtoId: r.item.produtoId,
    nome: r.item.produto.nome,
    descricao: r.item.produto.descricao,
    categoria: r.item.produto.categoria,
    preco: centavosParaReais(r.item.precoCentavos),
    disponivel: r.disponivel,
  };
}
