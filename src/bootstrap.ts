import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { requestIdMiddleware } from './api/common/request-id.middleware';
import { criarValidationPipe } from './api/common/validacao';

export function configurarApp(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.useGlobalPipes(criarValidationPipe());
  app.enableCors({ exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'] });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}

export function configurarSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API Raízes do Nordeste')
    .setDescription(
      'API da rede Raízes do Nordeste. Para testar, faça login em POST /auth/login, copie o accessToken e cole em Authorize.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const documento = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documento, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'method' },
  });
}
