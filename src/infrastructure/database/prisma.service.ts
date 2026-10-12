import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type TransacaoPrisma = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await this.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
