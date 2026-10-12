import { Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { FidelidadeService } from '../../application/fidelidade/fidelidade.service';
import { Perfil } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { VERSAO_TERMO_FIDELIDADE } from '../../domain/fidelidade/fidelidade.rules';
import { Contexto, Perfis } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { PaginacaoQueryDto } from '../common/paginacao.dto';

export class SaldoFidelidadeDto {
  @ApiProperty({ example: 120 }) saldoPontos: number;
  @ApiProperty({ example: 12.0, description: 'Valor equivalente em reais (10 pontos = R$ 1,00)' }) equivalenteEmReais: number;
  @ApiProperty({ example: true }) consentimentoAtivo: boolean;
}

export class ConsentimentoCriadoDto {
  @ApiProperty({ example: 'FIDELIDADE' }) finalidade: string;
  @ApiProperty({ example: VERSAO_TERMO_FIDELIDADE }) versaoTermo: string;
  @ApiProperty() concedidoEm: Date;
}

@ApiTags('Fidelidade')
@ApiBearerAuth()
@Perfis(Perfil.CLIENTE)
@Controller('fidelidade')
export class FidelidadeController {
  constructor(private readonly fidelidade: FidelidadeService) {}

  @Get('saldo')
  @ApiOperation({ summary: 'Saldo de pontos (CLIENTE)' })
  @ApiOkResponse({ type: SaldoFidelidadeDto })
  @ApiErros(401, 403)
  async saldo(@Contexto() ctx: ContextoRequisicao): Promise<SaldoFidelidadeDto> {
    const { saldoPontos, consentimentoAtivo } = await this.fidelidade.obterSaldo(ctx.usuario.id);
    return { saldoPontos, equivalenteEmReais: saldoPontos / 10, consentimentoAtivo };
  }

  @Get('extrato')
  @ApiOperation({ summary: 'Histórico de pontos: acúmulos, resgates e estornos (CLIENTE)' })
  @ApiErros(401, 403, 422)
  async extrato(@Query() paginacao: PaginacaoQueryDto, @Contexto() ctx: ContextoRequisicao) {
    const pagina = await this.fidelidade.extrato(ctx.usuario.id, paginacao);
    return {
      ...pagina,
      data: pagina.data.map((t) => ({ id: t.id, tipo: t.tipo, pontos: t.pontos, descricao: t.descricao, pedidoId: t.pedidoId, createdAt: t.createdAt })),
    };
  }

  @Post('consentimento')
  @ApiOperation({
    summary: 'Aderir ao programa de fidelidade (consentimento LGPD)',
    description: 'Base legal: consentimento (LGPD art. 7º, I). Registra versão do termo e data.',
  })
  @ApiCreatedResponse({ type: ConsentimentoCriadoDto })
  @ApiErros(401, 403, 409)
  async consentir(@Contexto() ctx: ContextoRequisicao): Promise<ConsentimentoCriadoDto> {
    const c = await this.fidelidade.concederConsentimento(ctx);
    return { finalidade: c.finalidade, versaoTermo: c.versaoTermo, concedidoEm: c.concedidoEm };
  }

  @Delete('consentimento')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revogar consentimento (o acúmulo e o resgate param; o saldo fica congelado)' })
  @ApiNoContentResponse()
  @ApiErros(401, 403, 409)
  async revogar(@Contexto() ctx: ContextoRequisicao): Promise<void> {
    await this.fidelidade.revogarConsentimento(ctx);
  }
}
