import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  res.status(500).json({ error: message, code: 'INTERNAL' });
}

export function asyncHandler<R extends Request, S extends Response>(
  fn: (req: R, res: S, next: NextFunction) => Promise<unknown>
) {
  return (req: R, res: S, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
