import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default function globalSetup(): void {
  const raiz = resolve(__dirname, '..');
  for (const sufixo of ['', '-journal', '-wal', '-shm']) {
    rmSync(resolve(raiz, 'prisma', `test.db${sufixo}`), { force: true });
  }
  const env = { ...process.env, DATABASE_URL: 'file:./test.db' };
  execSync('npx prisma migrate deploy', { cwd: raiz, env, stdio: 'ignore' });
  execSync('npx prisma db seed', { cwd: raiz, env, stdio: 'ignore' });
}
