import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// senha de todos os usuarios de teste
export const SENHA_PADRAO_SEED = 'Raizes@2026';

const UNIDADES = [
  { nome: 'Raízes do Nordeste - Matriz Recife Antigo', tipo: 'MATRIZ', cidade: 'Recife', uf: 'PE', endereco: 'Rua do Bom Jesus, 125' },
  { nome: 'Raízes do Nordeste - Boa Viagem', tipo: 'FILIAL', cidade: 'Recife', uf: 'PE', endereco: 'Av. Boa Viagem, 1000' },
  { nome: 'Raízes do Nordeste - Pelourinho', tipo: 'FILIAL', cidade: 'Salvador', uf: 'BA', endereco: 'Largo do Pelourinho, 12' },
  { nome: 'Raízes do Nordeste - Beira-Mar', tipo: 'FILIAL', cidade: 'Fortaleza', uf: 'CE', endereco: 'Av. Beira-Mar, 3000' },
] as const;

const PRODUTOS: [string, string, string, number][] = [
  ['Tapioca de carne de sol com queijo coalho', 'TAPIOCAS', 'Carne de sol desfiada com queijo coalho derretido', 1890],
  ['Tapioca de coco com leite condensado', 'TAPIOCAS', 'Coco ralado fresco e leite condensado', 1290],
  ['Cuscuz nordestino com ovo e manteiga', 'CUSCUZ', 'Cuscuz de milho com ovo frito e manteiga de garrafa', 1490],
  ['Cuscuz recheado com charque', 'CUSCUZ', 'Cuscuz com charque acebolado', 2190],
  ['Baião de dois', 'PRATOS', 'Arroz, feijão verde, queijo coalho e nata', 3290],
  ['Escondidinho de carne de sol', 'PRATOS', 'Purê de macaxeira gratinado com carne de sol', 3490],
  ['Acarajé completo', 'PRATOS', 'Com vatapá, caruru, camarão seco e vinagrete', 2490],
  ['Bolo de rolo (fatia)', 'DOCES', 'Tradicional bolo de rolo pernambucano com goiabada', 890],
  ['Cartola', 'DOCES', 'Banana frita, queijo manteiga, açúcar e canela', 1590],
  ['Suco de cajá 500ml', 'BEBIDAS', 'Polpa natural de cajá', 990],
  ['Caldo de cana 500ml', 'BEBIDAS', 'Moído na hora', 790],
  ['Café coado com rapadura', 'BEBIDAS', 'Café regional adoçado com rapadura', 590],
];

// apaga tudo antes pra sempre comecar do mesmo estado
async function limpar(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.transacaoPontos.deleteMany();
  await prisma.contaFidelidade.deleteMany();
  await prisma.consentimento.deleteMany();
  await prisma.movimentacaoEstoque.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.cardapioItem.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.unidade.deleteMany();
  await prisma.$executeRawUnsafe(`DELETE FROM sqlite_sequence`).catch(() => undefined);
}

async function main(): Promise<void> {
  await limpar();
  const senhaHash = await bcrypt.hash(SENHA_PADRAO_SEED, 10);

  const unidades = [];
  for (const u of UNIDADES) unidades.push(await prisma.unidade.create({ data: u }));
  const [matriz, recife, salvador, fortaleza] = unidades;

  const produtos = [];
  for (const [nome, categoria, descricao] of PRODUTOS) {
    produtos.push(await prisma.produto.create({ data: { nome, categoria, descricao } }));
  }

  const ajustePreco: Record<number, number> = { [matriz.id]: 1, [recife.id]: 1, [salvador.id]: 0.95, [fortaleza.id]: 0.97 };
  for (const unidade of unidades) {
    for (const [indice, produto] of produtos.entries()) {
      const ehAcaraje = produto.nome.startsWith('Acarajé');
      if (ehAcaraje && unidade.id !== salvador.id) continue;
      const precoCentavos = Math.round((PRODUTOS[indice][3] * ajustePreco[unidade.id]) / 10) * 10;
      await prisma.cardapioItem.create({ data: { unidadeId: unidade.id, produtoId: produto.id, precoCentavos } });

      // unidade 2: cartola com 1 so e caldo de cana zerado, usados nos testes
      let quantidade = 50;
      if (unidade.id === recife.id && produto.nome === 'Cartola') quantidade = 1;
      if (unidade.id === recife.id && produto.nome.startsWith('Caldo de cana')) quantidade = 0;
      const estoque = await prisma.estoque.create({ data: { unidadeId: unidade.id, produtoId: produto.id, quantidade } });
      if (quantidade > 0) {
        await prisma.movimentacaoEstoque.create({
          data: { estoqueId: estoque.id, tipo: 'ENTRADA', quantidade, motivo: 'CARGA_INICIAL' },
        });
      }
    }
  }

  const usuarios = [
    { nome: 'Administração Matriz', email: 'admin@raizes.com', perfil: 'ADMIN', unidadeId: null },
    { nome: 'Gerente Boa Viagem', email: 'gerente.recife@raizes.com', perfil: 'GERENTE', unidadeId: recife.id },
    { nome: 'Atendente Boa Viagem', email: 'atendente.recife@raizes.com', perfil: 'ATENDENTE', unidadeId: recife.id },
    { nome: 'Cozinha Boa Viagem', email: 'cozinha.recife@raizes.com', perfil: 'COZINHA', unidadeId: recife.id },
    { nome: 'Gerente Pelourinho', email: 'gerente.salvador@raizes.com', perfil: 'GERENTE', unidadeId: salvador.id },
    { nome: 'Maria das Graças', email: 'cliente@raizes.com', perfil: 'CLIENTE', unidadeId: null, telefone: '(81) 98765-4321' },
    { nome: 'José Severino', email: 'cliente2@raizes.com', perfil: 'CLIENTE', unidadeId: null },
  ] as const;
  for (const u of usuarios) await prisma.usuario.create({ data: { ...u, senhaHash } });

  const maria = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cliente@raizes.com' } });
  await prisma.consentimento.create({ data: { usuarioId: maria.id, finalidade: 'FIDELIDADE', versaoTermo: '2026.1' } });
  const conta = await prisma.contaFidelidade.create({ data: { usuarioId: maria.id, saldoPontos: 200 } });
  await prisma.transacaoPontos.create({
    data: { contaId: conta.id, tipo: 'ACUMULO', pontos: 200, descricao: 'Bônus de boas-vindas (seed)' },
  });

  console.log(`Seed concluído: ${unidades.length} unidades, ${produtos.length} produtos, ${usuarios.length} usuários.`);
  console.log(`Senha de todos os usuários de teste: ${SENHA_PADRAO_SEED}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
