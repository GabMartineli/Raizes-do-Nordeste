import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from '../../application/usuarios/usuarios.service';
import { Perfil } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { Contexto, Perfis } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { ParseIdPipe } from '../common/validacao';
import {
  apresentarUsuario,
  AtualizarPerfilDto,
  CriarFuncionarioDto,
  FiltroUsuariosQueryDto,
  MeuPerfilRespostaDto,
  UsuarioRespostaDto,
} from './usuarios.dto';

@ApiTags('Usuários')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get('me')
  @ApiOperation({ summary: 'Meus dados (direito de acesso — LGPD art. 18, II)' })
  @ApiOkResponse({ type: MeuPerfilRespostaDto })
  @ApiErros(401)
  async meusDados(@Contexto() ctx: ContextoRequisicao): Promise<MeuPerfilRespostaDto> {
    const { usuario, consentimentos } = await this.usuarios.obterPerfilProprio(ctx.usuario.id);
    return { ...apresentarUsuario(usuario), consentimentos };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualizar meus dados (direito de correção — LGPD art. 18, III)' })
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiErros(401, 422)
  async atualizar(@Body() dto: AtualizarPerfilDto, @Contexto() ctx: ContextoRequisicao): Promise<UsuarioRespostaDto> {
    return apresentarUsuario(await this.usuarios.atualizarPerfilProprio(dto, ctx));
  }

  @Delete('me')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Excluir minha conta (anonimização — LGPD art. 18, VI)',
    description: 'Anonimiza os dados pessoais e revoga consentimentos. Pedidos são mantidos sem identificação por obrigação fiscal.',
  })
  @ApiNoContentResponse()
  @ApiErros(401, 409)
  async excluir(@Contexto() ctx: ContextoRequisicao): Promise<void> {
    await this.usuarios.anonimizarProprio(ctx);
  }

  @Get()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Listar usuários (ADMIN)' })
  @ApiOkResponse({ type: [UsuarioRespostaDto] })
  @ApiErros(401, 403, 422)
  async listar(@Query() filtro: FiltroUsuariosQueryDto) {
    const pagina = await this.usuarios.listar(filtro);
    return { ...pagina, data: pagina.data.map((u) => apresentarUsuario(u)) };
  }

  @Post()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastrar funcionário (ADMIN)' })
  @ApiCreatedResponse({ type: UsuarioRespostaDto })
  @ApiErros(401, 403, 404, 409, 422)
  async criarFuncionario(@Body() dto: CriarFuncionarioDto, @Contexto() ctx: ContextoRequisicao): Promise<UsuarioRespostaDto> {
    return apresentarUsuario(await this.usuarios.criarFuncionario(dto, ctx));
  }

  @Get(':id')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Consultar usuário (GERENTE/ADMIN)',
    description: 'Acesso a dados pessoais de terceiros: gera registro de auditoria. Para GERENTE o contato é mascarado.',
  })
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiErros(401, 403, 404, 422)
  async obter(@Param('id', ParseIdPipe) id: number, @Contexto() ctx: ContextoRequisicao): Promise<UsuarioRespostaDto> {
    const usuario = await this.usuarios.obterPorId(id, ctx);
    return apresentarUsuario(usuario, { mascararContato: ctx.usuario.perfil !== Perfil.ADMIN });
  }
}
