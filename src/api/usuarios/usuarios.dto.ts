import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Usuario } from '@prisma/client';
import { Perfil } from '../../domain/shared/enums';
import { PaginacaoQueryDto } from '../common/paginacao.dto';

const REGEX_SENHA = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const REGEX_TELEFONE = /^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/;

export class RegistrarDto {
  @ApiProperty({ example: 'Maria das Graças' })
  @IsString()
  @IsNotEmpty({ message: 'nome é obrigatório' })
  @MaxLength(120)
  nome: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Senha@123', description: 'Mínimo 8 caracteres, com letras e números' })
  @IsString()
  @Matches(REGEX_SENHA, { message: 'senha deve ter no mínimo 8 caracteres, com letras e números' })
  @MaxLength(72)
  senha: string;

  @ApiPropertyOptional({ example: '(81) 98765-4321', description: 'Opcional (minimização de dados)' })
  @IsOptional()
  @Matches(REGEX_TELEFONE, { message: 'telefone deve estar no formato (DD) 9XXXX-XXXX' })
  telefone?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Consentimento LGPD para o programa de fidelidade (pontos). Pode ser revogado a qualquer momento.',
  })
  @IsOptional()
  @IsBoolean()
  aceitaProgramaFidelidade?: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  email: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  @MinLength(1, { message: 'senha é obrigatória' })
  senha: string;
}

export class AtualizarPerfilDto extends PartialType(PickType(RegistrarDto, ['nome', 'telefone'] as const)) {}

export class CriarFuncionarioDto extends OmitType(RegistrarDto, ['aceitaProgramaFidelidade'] as const) {
  @ApiProperty({ enum: [Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN], example: Perfil.ATENDENTE })
  @IsEnum(Perfil, { message: 'perfil inválido' })
  perfil: Perfil;

  @ApiPropertyOptional({ example: 2, description: 'Obrigatório para ATENDENTE, COZINHA e GERENTE' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  unidadeId?: number;
}

export class FiltroUsuariosQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: Perfil })
  @IsOptional()
  @IsEnum(Perfil, { message: 'perfil inválido' })
  perfil?: Perfil;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unidadeId?: number;
}

export class UsuarioRespostaDto {
  @ApiProperty({ example: 10 }) id: number;
  @ApiProperty({ example: 'Maria das Graças' }) nome: string;
  @ApiProperty({ example: 'maria@exemplo.com' }) email: string;
  @ApiPropertyOptional({ example: '(81) 98765-4321', nullable: true }) telefone: string | null;
  @ApiProperty({ enum: Perfil, example: Perfil.CLIENTE }) perfil: Perfil;
  @ApiPropertyOptional({ example: null, nullable: true }) unidadeId: number | null;
  @ApiProperty({ example: true }) ativo: boolean;
  @ApiProperty({ example: '2026-10-04T12:00:00.000Z' }) createdAt: Date;
}

export class ConsentimentoRespostaDto {
  @ApiProperty({ example: 'FIDELIDADE' }) finalidade: string;
  @ApiProperty({ example: '2026.1' }) versaoTermo: string;
  @ApiProperty({ example: '2026-10-04T12:00:00.000Z' }) concedidoEm: Date;
}

export class MeuPerfilRespostaDto extends UsuarioRespostaDto {
  @ApiProperty({ type: [ConsentimentoRespostaDto] }) consentimentos: ConsentimentoRespostaDto[];
}

export class LoginRespostaDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }) accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ example: 3600 }) expiresIn: number;
  @ApiProperty({ type: UsuarioRespostaDto }) user: UsuarioRespostaDto;
}

export function apresentarUsuario(u: Usuario, opcoes: { mascararContato?: boolean } = {}): UsuarioRespostaDto {
  return {
    id: u.id,
    nome: u.nome,
    email: opcoes.mascararContato ? mascararEmail(u.email) : u.email,
    telefone: u.telefone && opcoes.mascararContato ? mascararTelefone(u.telefone) : u.telefone,
    perfil: u.perfil,
    unidadeId: u.unidadeId,
    ativo: u.ativo,
    createdAt: u.createdAt,
  };
}

export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split('@');
  return `${usuario.slice(0, 2)}***@${dominio}`;
}

export function mascararTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '');
  return `(${digitos.slice(0, 2)}) *****-${digitos.slice(-4)}`;
}
