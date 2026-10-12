import { Injectable } from '@nestjs/common';
import { NaoAutenticadoError, RegraNegocioError } from '../../domain/shared/errors';
import { FinalidadeConsentimento, Perfil } from '../../domain/shared/enums';
import { VERSAO_TERMO_FIDELIDADE } from '../../domain/fidelidade/fidelidade.rules';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SenhaService } from '../../infrastructure/seguranca/senha.service';
import { TokenService } from '../../infrastructure/seguranca/token.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';

export interface DadosRegistro {
  nome: string;
  email: string;
  senha: string;
  telefone?: string;
  aceitaProgramaFidelidade?: boolean;
}

export interface MetadadosRequisicao {
  ip?: string;
  requestId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly tokens: TokenService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async registrar(dados: DadosRegistro, meta: MetadadosRequisicao) {
    const email = dados.email.trim().toLowerCase();
    const existente = await this.prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      throw new RegraNegocioError('EMAIL_JA_CADASTRADO', 'Já existe uma conta com este e-mail.', [
        { field: 'email', issue: 'E-mail já cadastrado' },
      ]);
    }
    const senhaHash = await this.senhas.gerarHash(dados.senha);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { nome: dados.nome.trim(), email, senhaHash, telefone: dados.telefone, perfil: Perfil.CLIENTE },
      });
      if (dados.aceitaProgramaFidelidade) {
        await tx.consentimento.create({
          data: { usuarioId: usuario.id, finalidade: FinalidadeConsentimento.FIDELIDADE, versaoTermo: VERSAO_TERMO_FIDELIDADE },
        });
        await tx.contaFidelidade.create({ data: { usuarioId: usuario.id } });
      }
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.USUARIO_REGISTRADO,
          entidade: 'Usuario',
          entidadeId: usuario.id,
          detalhes: { consentimentoFidelidade: !!dados.aceitaProgramaFidelidade },
        },
        { usuarioId: usuario.id, ...meta },
        tx,
      );
      return usuario;
    });
  }

  async login(email: string, senha: string, meta: MetadadosRequisicao) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
    const senhaConfere = usuario ? await this.senhas.conferir(senha, usuario.senhaHash) : false;

    // mesma mensagem pra email errado e senha errada
    if (!usuario || !senhaConfere || !usuario.ativo) {
      await this.auditoria.registrar(
        { acao: AcaoAuditoria.LOGIN_FALHA, entidade: 'Usuario', entidadeId: usuario?.id },
        { usuarioId: usuario?.id, ...meta },
      );
      throw new NaoAutenticadoError('CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
    }

    const accessToken = this.tokens.emitir({ sub: usuario.id, email: usuario.email, perfil: usuario.perfil });
    await this.auditoria.registrar(
      { acao: AcaoAuditoria.LOGIN_SUCESSO, entidade: 'Usuario', entidadeId: usuario.id },
      { usuarioId: usuario.id, ...meta },
    );
    return { accessToken, expiresIn: this.tokens.expiraEmSegundos, usuario };
  }
}
