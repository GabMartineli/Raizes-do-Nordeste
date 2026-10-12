import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UnidadesService } from '../../application/catalogo/unidades.service';
import { Perfil } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { Contexto, Perfis, Publico } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { ParseIdPipe } from '../common/validacao';
import {
  apresentarItemCardapio,
  apresentarUnidade,
  CriarUnidadeDto,
  DefinirItemCardapioDto,
  FiltroCardapioQueryDto,
  FiltroUnidadesQueryDto,
  ItemCardapioRespostaDto,
  UnidadeRespostaDto,
} from './catalogo.dto';

@ApiTags('Unidades e Cardápio')
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Listar unidades da rede' })
  @ApiOkResponse({ type: [UnidadeRespostaDto] })
  @ApiErros(422)
  async listar(@Query() filtro: FiltroUnidadesQueryDto) {
    const pagina = await this.unidades.listar(filtro);
    return { ...pagina, data: pagina.data.map(apresentarUnidade) };
  }

  @Get(':id')
  @Publico()
  @ApiOperation({ summary: 'Consultar unidade' })
  @ApiOkResponse({ type: UnidadeRespostaDto })
  @ApiErros(404, 422)
  async obter(@Param('id', ParseIdPipe) id: number): Promise<UnidadeRespostaDto> {
    return apresentarUnidade(await this.unidades.obter(id));
  }

  @Post()
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastrar unidade (ADMIN)' })
  @ApiCreatedResponse({ type: UnidadeRespostaDto })
  @ApiErros(401, 403, 422)
  async criar(@Body() dto: CriarUnidadeDto): Promise<UnidadeRespostaDto> {
    return apresentarUnidade(await this.unidades.criar(dto));
  }

  @Get(':id/cardapio')
  @Publico()
  @ApiOperation({
    summary: 'Cardápio da unidade',
    description: 'Preços são definidos por unidade. "disponivel" considera o cardápio e o saldo em estoque da unidade.',
  })
  @ApiOkResponse({ type: [ItemCardapioRespostaDto] })
  @ApiErros(404, 422)
  async cardapio(@Param('id', ParseIdPipe) id: number, @Query() filtro: FiltroCardapioQueryDto) {
    const itens = await this.unidades.cardapio(id, filtro);
    return { unidadeId: id, itens: itens.map(apresentarItemCardapio) };
  }

  @Put(':id/cardapio/:produtoId')
  @ApiBearerAuth()
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Incluir/atualizar item no cardápio da unidade (GERENTE da unidade/ADMIN)' })
  @ApiOkResponse({ type: ItemCardapioRespostaDto })
  @ApiErros(401, 403, 404, 422)
  async definirItem(
    @Param('id', ParseIdPipe) id: number,
    @Param('produtoId', ParseIdPipe) produtoId: number,
    @Body() dto: DefinirItemCardapioDto,
    @Contexto() ctx: ContextoRequisicao,
  ): Promise<ItemCardapioRespostaDto> {
    return apresentarItemCardapio(await this.unidades.definirItemCardapio(id, produtoId, dto, ctx));
  }
}
