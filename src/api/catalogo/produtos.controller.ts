import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProdutosService } from '../../application/catalogo/produtos.service';
import { Perfil } from '../../domain/shared/enums';
import { Perfis, Publico } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { ParseIdPipe } from '../common/validacao';
import {
  apresentarProduto,
  AtualizarProdutoDto,
  CriarProdutoDto,
  FiltroProdutosQueryDto,
  ProdutoRespostaDto,
} from './catalogo.dto';

@ApiTags('Produtos')
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtos: ProdutosService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Listar produtos da rede (catálogo geral)' })
  @ApiOkResponse({ type: [ProdutoRespostaDto] })
  @ApiErros(422)
  async listar(@Query() filtro: FiltroProdutosQueryDto) {
    const pagina = await this.produtos.listar(filtro);
    return { ...pagina, data: pagina.data.map(apresentarProduto) };
  }

  @Get(':id')
  @Publico()
  @ApiOperation({ summary: 'Consultar produto' })
  @ApiOkResponse({ type: ProdutoRespostaDto })
  @ApiErros(404, 422)
  async obter(@Param('id', ParseIdPipe) id: number): Promise<ProdutoRespostaDto> {
    return apresentarProduto(await this.produtos.obter(id));
  }

  @Post()
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastrar produto (ADMIN)' })
  @ApiCreatedResponse({ type: ProdutoRespostaDto })
  @ApiErros(401, 403, 422)
  async criar(@Body() dto: CriarProdutoDto): Promise<ProdutoRespostaDto> {
    return apresentarProduto(await this.produtos.criar(dto));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Atualizar produto (ADMIN)' })
  @ApiOkResponse({ type: ProdutoRespostaDto })
  @ApiErros(401, 403, 404, 422)
  async atualizar(@Param('id', ParseIdPipe) id: number, @Body() dto: AtualizarProdutoDto): Promise<ProdutoRespostaDto> {
    return apresentarProduto(await this.produtos.atualizar(id, dto));
  }
}
