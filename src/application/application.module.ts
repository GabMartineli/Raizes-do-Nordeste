import { Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria/auditoria.service';
import { AuthService } from './auth/auth.service';
import { ProdutosService } from './catalogo/produtos.service';
import { UnidadesService } from './catalogo/unidades.service';
import { EstoqueService } from './estoque/estoque.service';
import { FidelidadeService } from './fidelidade/fidelidade.service';
import { PagamentosService } from './pagamentos/pagamentos.service';
import { PedidosService } from './pedidos/pedidos.service';
import { UsuariosService } from './usuarios/usuarios.service';

const servicos = [
  AuditoriaService,
  AuthService,
  UsuariosService,
  UnidadesService,
  ProdutosService,
  EstoqueService,
  FidelidadeService,
  PedidosService,
  PagamentosService,
];

@Module({
  providers: servicos,
  exports: servicos,
})
export class ApplicationModule {}
