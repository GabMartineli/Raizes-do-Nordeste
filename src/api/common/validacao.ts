import { PipeTransform, ValidationError, ValidationPipe } from '@nestjs/common';
import { DetalheErro, ValidacaoError } from '../../domain/shared/errors';

function achatar(erros: ValidationError[], prefixo = ''): DetalheErro[] {
  return erros.flatMap((erro) => {
    const campo = /^\d+$/.test(erro.property) ? `${prefixo}[${erro.property}]` : prefixo ? `${prefixo}.${erro.property}` : erro.property;
    const proprios = Object.values(erro.constraints ?? {}).map((issue) => ({ field: campo, issue }));
    return [...proprios, ...achatar(erro.children ?? [], campo)];
  });
}

export function criarValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (erros) =>
      new ValidacaoError('VALIDACAO', 'Os dados enviados são inválidos.', achatar(erros)),
  });
}

export class ParseIdPipe implements PipeTransform<string, number> {
  transform(valor: string): number {
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidacaoError('PARAMETRO_INVALIDO', 'O identificador informado é inválido.', [
        { field: 'id', issue: 'Deve ser um número inteiro positivo' },
      ]);
    }
    return id;
  }
}
