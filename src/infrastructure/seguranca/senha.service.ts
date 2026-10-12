import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const CUSTO_BCRYPT = 10;

@Injectable()
export class SenhaService {
  gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, CUSTO_BCRYPT);
  }

  conferir(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }
}
