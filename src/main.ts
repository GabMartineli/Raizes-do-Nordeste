import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp, configurarSwagger } from './bootstrap';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
  }
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  configurarSwagger(app);
  app.enableShutdownHooks();

  const porta = Number(process.env.PORT ?? 3000);
  await app.listen(porta);
  Logger.log(`API rodando em http://localhost:${porta}`, 'Bootstrap');
  Logger.log(`Swagger em http://localhost:${porta}/docs`, 'Bootstrap');
}

void bootstrap();
