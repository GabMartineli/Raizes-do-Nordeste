import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Perfil } from '../../domain/shared/enums';

export interface PayloadToken {
  sub: number;
  email: string;
  perfil: Perfil;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  readonly expiraEmSegundos = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 3600);

  emitir(payload: PayloadToken): string {
    return this.jwt.sign(payload, { expiresIn: this.expiraEmSegundos });
  }

  verificar(token: string): PayloadToken | null {
    try {
      return this.jwt.verify<PayloadToken>(token);
    } catch {
      return null;
    }
  }
}
