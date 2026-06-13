import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '../../shared/types.js';

interface HttpError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: HttpError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[Error]', err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = (err as HttpError).statusCode || 500;
  const code = (err as HttpError).code || 'INTERNAL_ERROR';
  const message = err.message || '服务器内部错误';

  const errorResponse: ApiError = {
    code,
    message,
  };

  res.status(statusCode).json({
    success: false,
    error: errorResponse,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '接口不存在',
    },
  });
}

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
