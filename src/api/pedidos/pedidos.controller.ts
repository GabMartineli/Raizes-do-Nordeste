import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PedidosService } from '../../application/pedidos/pedidos.service';
import { Perfil } from '../../domain/shared/enums';
import { centavosParaReais } from '../../domain/shared/dinheiro';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { Contexto, Perfis } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { ParseIdPipe } from '../common/validacao';
import {
  apresentarPedido,
  AtualizarStatusDto,
  CancelarPedidoDto,
  CriarPedidoDto,
  FiltroPedidosQueryDto,
  PedidoRespostaDto,
  ResumoCanaisQueryDto,
} from './pedidos.dto';

@ApiTags('Pedidos')
@ApiBearerAuth()
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post()
  @Perfis(Perfil.CLIENTE, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Criar pedido (fluxo crítico)',
    description:
      'Valida canal x perfil, unidade, cardápio e estoque; calcula o total, reserva o estoque e retorna o pedido em AGUARDANDO_PAGAMENTO.',
  })
  @ApiCreatedResponse({ type: PedidoRespostaDto })
  @ApiErros(401, 403, 404, 409, 422)
  async criar(@Body() dto: CriarPedidoDto, @Contexto() ctx: ContextoRequisicao): Promise<PedidoRespostaDto> {
    return apresentarPedido(await this.pedidos.criar(dto, ctx));
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pedidos com filtros (canal, status, unidade)',
    description: 'Cliente vê os próprios pedidos; funcionários veem os da sua unidade; ADMIN vê a rede toda. Ex.: ?canalPedido=TOTEM&status=PAGO',
  })
  @ApiOkResponse({ type: [PedidoRespostaDto] })
  @ApiErros(401, 403, 422)
  async listar(@Query() filtro: FiltroPedidosQueryDto, @Contexto() ctx: ContextoRequisicao) {
    const pagina = await this.pedidos.listar(filtro, ctx);
    return { ...pagina, data: pagina.data.map(apresentarPedido) };
  }

  @Get('resumo-canais')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Consolidação de pedidos por canal e status (GERENTE/ADMIN)' })
  @ApiErros(401, 403, 422)
  async resumoPorCanal(@Query() filtro: ResumoCanaisQueryDto, @Contexto() ctx: ContextoRequisicao) {
    const { unidadeId, grupos } = await this.pedidos.resumoPorCanal(filtro, ctx);
    return {
      unidadeId,
      grupos: grupos.map((g) => ({
        canalPedido: g.canalPedido,
        status: g.status,
        quantidade: g._count._all,
        valorTotal: centavosParaReais(g._sum.totalCentavos ?? 0),
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pedido (acompanhamento de status)' })
  @ApiOkResponse({ type: PedidoRespostaDto })
  @ApiErros(401, 403, 404, 422)
  async obter(@Param('id', ParseIdPipe) id: number, @Contexto() ctx: ContextoRequisicao): Promise<PedidoRespostaDto> {
    return apresentarPedido(await this.pedidos.obter(id, ctx));
  }

  @Patch(':id/status')
  @Perfis(Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Atualizar status operacional (cozinha/balcão)',
    description: 'Transições: PAGO→EM_PREPARO e EM_PREPARO→PRONTO (COZINHA/GERENTE/ADMIN); PRONTO→ENTREGUE (também ATENDENTE). Transição inválida = 409.',
  })
  @ApiOkResponse({ type: PedidoRespostaDto })
  @ApiErros(401, 403, 404, 409, 422)
  async atualizarStatus(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: AtualizarStatusDto,
    @Contexto() ctx: ContextoRequisicao,
  ): Promise<PedidoRespostaDto> {
    return apresentarPedido(await this.pedidos.atualizarStatus(id, dto.status, ctx));
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancelar pedido',
    description:
      'Cliente: antes do pagamento. Atendente: até PAGO. Gerente/Admin: até EM_PREPARO. Estorna o pagamento (mock), devolve o estoque e ajusta os pontos.',
  })
  @ApiOkResponse({ type: PedidoRespostaDto })
  @ApiErros(401, 403, 404, 409, 422)
  async cancelar(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CancelarPedidoDto,
    @Contexto() ctx: ContextoRequisicao,
  ): Promise<PedidoRespostaDto> {
    return apresentarPedido(await this.pedidos.cancelar(id, dto.motivo, ctx));
  }
}
