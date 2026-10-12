import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AcessoNegadoError, NaoEncontradoError, RegraNegocioError } from '../../domain/shared/errors';
import { Perfil, StatusPedido } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SenhaService } from '../../infrastructure/seguranca/senha.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

export interface DadosFuncionario {
  nome: string;
  email: string;
  senha: string;
  telefone?: string;
  perfil: Perfil;
  unidadeId?: number;
}

export interface FiltroUsuarios extends ParametrosPaginacao {
  perfil?: Perfil;
  unidadeId?: number;
}

const STATUS_EM_ANDAMENTO = [
  StatusPedido.AGUARDANDO_PAGAMENTO,
  StatusPedido.PAGO,
  StatusPedido.EM_PREPARO,
  StatusPedido.PRONTO,
];

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obterPerfilProprio(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new NaoEncontradoError('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');
    const consentimentos = await this.prisma.consentimento.findMany({
      where: { usuarioId, revogadoEm: null },
      select: { finalidade: true, versaoTermo: true, concedidoEm: true },
    });
    return { usuario, consentimentos };
  }

  async atualizarPerfilProprio(dados: { nome?: string; telefone?: string }, ctx: ContextoRequisicao) {
    const usuario = await this.prisma.usuario.update({
      where: { id: ctx.usuario.id },
      data: { nome: dados.nome?.trim(), telefone: dados.telefone },
    });
    await this.auditoria.registrar(
      {
        acao: AcaoAuditoria.DADOS_PESSOAIS_ATUALIZADOS,
        entidade: 'Usuario',
        entidadeId: usuario.id,
        detalhes: { campos: Object.keys(dados) },
      },
      ctx,
    );
    return usuario;
  }

  // LGPD: anonimiza em vez de apagar, os pedidos ficam por causa da parte fiscal
  async anonimizarProprio(ctx: ContextoRequisicao): Promise<void> {
    const usuarioId = ctx.usuario.id;
    const emAndamento = await this.prisma.pedido.count({
      where: { clienteId: usuarioId, status: { in: STATUS_EM_ANDAMENTO } },
    });
    if (emAndamento > 0) {
      throw new RegraNegocioError(
        'PEDIDOS_EM_ANDAMENTO',
        'Não é possível excluir a conta enquanto houver pedidos em andamento.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          nome: 'Usuário anonimizado',
          email: `anonimizado+${usuarioId}@raizes.invalid`,
          telefone: null,
          senhaHash: await this.senhas.gerarHash(randomUUID()),
          ativo: false,
          anonimizadoEm: new Date(),
        },
      });
      await tx.consentimento.updateMany({
        where: { usuarioId, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
      await this.auditoria.registrar(
        { acao: AcaoAuditoria.USUARIO_ANONIMIZADO, entidade: 'Usuario', entidadeId: usuarioId },
        ctx,
        tx,
      );
    });
  }

  async criarFuncionario(dados: DadosFuncionario, ctx: ContextoRequisicao) {
    if (dados.perfil === Perfil.CLIENTE) {
      throw new RegraNegocioError('PERFIL_INVALIDO', 'Clientes se cadastram por /auth/registrar.', [
        { field: 'perfil', issue: 'Use ATENDENTE, COZINHA, GERENTE ou ADMIN' },
      ]);
    }
    if (dados.perfil !== Perfil.ADMIN && !dados.unidadeId) {
      throw new RegraNegocioError('UNIDADE_OBRIGATORIA', 'Funcionários de loja precisam estar lotados em uma unidade.', [
        { field: 'unidadeId', issue: 'Obrigatório para ATENDENTE, COZINHA e GERENTE' },
      ]);
    }
    if (dados.unidadeId) {
      const unidade = await this.prisma.unidade.findUnique({ where: { id: dados.unidadeId } });
      if (!unidade) throw new NaoEncontradoError('UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.');
    }
    const email = dados.email.trim().toLowerCase();
    if (await this.prisma.usuario.findUnique({ where: { email } })) {
      throw new RegraNegocioError('EMAIL_JA_CADASTRADO', 'Já existe uma conta com este e-mail.', [
        { field: 'email', issue: 'E-mail já cadastrado' },
      ]);
    }
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dados.nome.trim(),
        email,
        telefone: dados.telefone,
        perfil: dados.perfil,
        unidadeId: dados.perfil === Perfil.ADMIN ? null : dados.unidadeId,
        senhaHash: await this.senhas.gerarHash(dados.senha),
      },
    });
    await this.auditoria.registrar(
      {
        acao: AcaoAuditoria.FUNCIONARIO_CRIADO,
        entidade: 'Usuario',
        entidadeId: usuario.id,
        detalhes: { perfil: usuario.perfil, unidadeId: usuario.unidadeId },
      },
      ctx,
    );
    return usuario;
  }

  async listar(filtro: FiltroUsuarios) {
    const { page, limit, skip } = normalizarPaginacao(filtro);
    const where: Prisma.UsuarioWhereInput = { perfil: filtro.perfil, unidadeId: filtro.unidadeId };
    const [usuarios, total] = await Promise.all([
      this.prisma.usuario.findMany({ where, orderBy: { id: 'asc' }, skip, take: limit }),
      this.prisma.usuario.count({ where }),
    ]);
    return montarPagina(usuarios, total, page, limit);
  }

  async obterPorId(id: number, ctx: ContextoRequisicao) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new NaoEncontradoError('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');

    const ator = ctx.usuario;
    if (ator.perfil === Perfil.GERENTE) {
      const podeVer = usuario.perfil === Perfil.CLIENTE || usuario.unidadeId === ator.unidadeId;
      if (!podeVer) throw new AcessoNegadoError('Gerentes só consultam clientes e funcionários da própria unidade.');
    }
    await this.auditoria.registrar(
      { acao: AcaoAuditoria.ACESSO_DADOS_PESSOAIS, entidade: 'Usuario', entidadeId: id },
      ctx,
    );
    return usuario;
  }
}
