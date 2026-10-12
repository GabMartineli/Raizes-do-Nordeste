process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'segredo-somente-para-testes-automatizados';
process.env.JWT_EXPIRES_IN_SECONDS = '3600';
process.env.RATE_LIMIT_POR_MINUTO = '10000';
process.env.LOGIN_LIMITE_POR_MINUTO = '1000';
