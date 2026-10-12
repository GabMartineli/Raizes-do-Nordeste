import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { AuditoriaService } from '../../application/auditoria/auditoria.service';
import { Perfil } from '../../domain/shared/enums';
import { Perfis, Publico } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { PaginacaoQueryDto } from '../common/paginacao.dto';

export class FiltroAuditoriaQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ example: 'PEDIDO_STATUS_ALTERADO' })
  @IsOptional()
  @IsString()
  acao?: string;

  @ApiPropertyOptional({ example: 'Pedido' })
  @IsOptional()
  @IsString()
  entidade?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  entidadeId?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  usuarioId?: number;
}

@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @Perfis(Perfil.ADMIN, Perfil.GERENTE)
  @ApiOperation({ summary: 'Trilha de auditoria de ações sensíveis (ADMIN/GERENTE)' })
  @ApiErros(401, 403, 422)
  async listar(@Query() filtro: FiltroAuditoriaQueryDto) {
    const pagina = await this.auditoria.listar(filtro);
    return { ...pagina, data: pagina.data.map((r) => ({ ...r, detalhes: r.detalhes ? JSON.parse(r.detalhes) : null })) };
  }
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @Publico()
  @ApiOperation({ summary: 'Verificação de disponibilidade da API' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
