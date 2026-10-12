import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req: Request & { requestId?: string }, res: Response, next: NextFunction): void {
  const recebido = req.header('x-request-id');
  req.requestId = recebido && /^[\w-]{1,64}$/.test(recebido) ? recebido : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
