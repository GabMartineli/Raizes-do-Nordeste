import { Injectable } from '@nestjs/common';
import { RegraNegocioError } from '../../domain/shared/errors';
import { FinalidadeConsentimento } from '../../domain/shared/enums';
import { ContextoRequisicao } from '../../domain/shared/usuario-autenticado';
import { calcularPontosGanhos, VERSAO_TERMO_FIDELIDADE } from '../../domain/fidelidade/fidelidade.rules';
import { PrismaService, TransacaoPrisma } from '../../infrastructure/database/prisma.service';
import { AcaoAuditoria, AuditoriaService } from '../auditoria/auditoria.service';
import { montarPagina, normalizarPaginacao, ParametrosPaginacao } from '../shared/paginacao';

@Injectable()
export class FidelidadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async possuiConsentimentoAtivo(usuarioId: number, tx: TransacaoPrisma = this.prisma): Promise<boolean> {
    const consentimento = await tx.consentimento.findFirst({
      where: { usuarioId, finalidade: FinalidadeConsentimento.FIDELIDADE, revogadoEm: null },
    });
    return !!consentimento;
  }

  async obterSaldo(usuarioId: number) {
    const [conta, consentimentoAtivo] = await Promise.all([
      this.prisma.contaFidelidade.findUnique({ where: { usuarioId } }),
      this.possuiConsentimentoAtivo(usuarioId),
    ]);
    return { saldoPontos: conta?.saldoPontos ?? 0, consentimentoAtivo };
  }

  async extrato(usuarioId: number, paginacao: ParametrosPaginacao) {
    const { page, limit, skip } = normalizarPaginacao(paginacao);
    const conta = await this.prisma.contaFidelidade.findUnique({ where: { usuarioId } });
    if (!conta) return montarPagina([], 0, page, limit);
    const [transacoes, total] = await Promise.all([
      this.prisma.transacaoPontos.findMany({ where: { contaId: conta.id }, orderBy: { id: 'desc' }, skip, take: limit }),
      this.prisma.transacaoPontos.count({ where: { contaId: conta.id } }),
    ]);
    return montarPagina(transacoes, total, page, limit);
  }

  async concederConsentimento(ctx: ContextoRequisicao) {
    const usuarioId = ctx.usuario.id;
    if (await this.possuiConsentimentoAtivo(usuarioId)) {
      throw new RegraNegocioError('CONSENTIMENTO_JA_ATIVO', 'O consentimento para o programa de fidelidade já está ativo.');
    }
    return this.prisma.$transaction(async (tx) => {
      const consentimento = await tx.consentimento.create({
        data: { usuarioId, finalidade: FinalidadeConsentimento.FIDELIDADE, versaoTermo: VERSAO_TERMO_FIDELIDADE },
      });
      await tx.contaFidelidade.upsert({ where: { usuarioId }, create: { usuarioId }, update: {} });
      await this.auditoria.registrar(
        { acao: AcaoAuditoria.CONSENTIMENTO_CONCEDIDO, entidade: 'Consentimento', entidadeId: consentimento.id, detalhes: { finalidade: 'FIDELIDADE' } },
        ctx,
        tx,
      );
      return consentimento;
    });
  }

  async revogarConsentimento(ctx: ContextoRequisicao): Promise<void> {
    const usuarioId = ctx.usuario.id;
    const resultado = await this.prisma.consentimento.updateMany({
      where: { usuarioId, finalidade: FinalidadeConsentimento.FIDELIDADE, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    if (resultado.count === 0) {
      throw new RegraNegocioError('CONSENTIMENTO_INEXISTENTE', 'Não há consentimento ativo para revogar.');
    }
    await this.auditoria.registrar(
      { acao: AcaoAuditoria.CONSENTIMENTO_REVOGADO, entidade: 'Usuario', entidadeId: usuarioId, detalhes: { finalidade: 'FIDELIDADE' } },
      ctx,
    );
  }

  async acumularPorPedido(tx: TransacaoPrisma, clienteId: number, pedidoId: number, totalPagoCentavos: number): Promise<number> {
    if (!(await this.possuiConsentimentoAtivo(clienteId, tx))) return 0;
    const pontos = calcularPontosGanhos(totalPagoCentavos);
    if (pontos === 0) return 0;
    const conta = await tx.contaFidelidade.upsert({
      where: { usuarioId: clienteId },
      create: { usuarioId: clienteId, saldoPontos: pontos },
      update: { saldoPontos: { increment: pontos } },
    });
    await tx.transacaoPontos.create({
      data: { contaId: conta.id, tipo: 'ACUMULO', pontos, descricao: `Pontos do pedido #${pedidoId}`, pedidoId },
    });
    return pontos;
  }

  async debitarResgate(tx: TransacaoPrisma, clienteId: number, pedidoId: number, pontos: number): Promise<void> {
    const conta = await tx.contaFidelidade.findUniqueOrThrow({ where: { usuarioId: clienteId } });
    const debito = await tx.contaFidelidade.updateMany({
      where: { id: conta.id, saldoPontos: { gte: pontos } },
      data: { saldoPontos: { decrement: pontos } },
    });
    if (debito.count === 0) {
      throw new RegraNegocioError('SALDO_PONTOS_INSUFICIENTE', 'Saldo de pontos insuficiente para o resgate.');
    }
    await tx.transacaoPontos.create({
      data: { contaId: conta.id, tipo: 'RESGATE', pontos: -pontos, descricao: `Resgate no pedido #${pedidoId}`, pedidoId },
    });
  }

  async estornarPorCancelamento(tx: TransacaoPrisma, clienteId: number, pedidoId: number): Promise<void> {
    const conta = await tx.contaFidelidade.findUnique({ where: { usuarioId: clienteId } });
    if (!conta) return;
    const transacoes = await tx.transacaoPontos.findMany({ where: { contaId: conta.id, pedidoId } });
    const ajuste = -transacoes.reduce((soma, t) => soma + t.pontos, 0);
    if (ajuste === 0) return;
    const ajusteEfetivo = Math.max(ajuste, -conta.saldoPontos);
    await tx.contaFidelidade.update({ where: { id: conta.id }, data: { saldoPontos: { increment: ajusteEfetivo } } });
    await tx.transacaoPontos.create({
      data: { contaId: conta.id, tipo: 'ESTORNO', pontos: ajusteEfetivo, descricao: `Estorno do pedido #${pedidoId} cancelado`, pedidoId },
    });
  }
}
