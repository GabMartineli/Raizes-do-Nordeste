import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/auth/auth.service';
import { Metadados, Publico } from '../auth/decorators';
import { ApiErros } from '../common/api-erros.decorator';
import { apresentarUsuario, LoginDto, LoginRespostaDto, RegistrarDto, UsuarioRespostaDto } from './usuarios.dto';

const limiteCredenciais = () => Number(process.env.LOGIN_LIMITE_POR_MINUTO ?? 20);

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('registrar')
  @Publico()
  @Throttle({ default: { limit: limiteCredenciais, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cadastrar cliente', description: 'Cria uma conta com perfil CLIENTE. A senha é armazenada com hash bcrypt.' })
  @ApiCreatedResponse({ type: UsuarioRespostaDto })
  @ApiErros(409, 422, 429)
  async registrar(@Body() dto: RegistrarDto, @Metadados() meta: { ip?: string; requestId?: string }): Promise<UsuarioRespostaDto> {
    return apresentarUsuario(await this.auth.registrar(dto, meta));
  }

  @Post('login')
  @Publico()
  @HttpCode(200)
  @Throttle({ default: { limit: limiteCredenciais, ttl: 60_000 } })
  @ApiOperation({ summary: 'Autenticar e obter token JWT', description: 'Limite de 20 tentativas por minuto por IP (configurável) (proteção contra força bruta).' })
  @ApiOkResponse({ type: LoginRespostaDto })
  @ApiErros(401, 422, 429)
  async login(@Body() dto: LoginDto, @Metadados() meta: { ip?: string; requestId?: string }): Promise<LoginRespostaDto> {
    const { accessToken, expiresIn, usuario } = await this.auth.login(dto.email, dto.senha, meta);
    return { accessToken, tokenType: 'Bearer', expiresIn, user: apresentarUsuario(usuario) };
  }
}
