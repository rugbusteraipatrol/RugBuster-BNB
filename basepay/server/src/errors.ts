/**
 * Application errors carry a stable machine-readable `code` because the widget
 * (and merchant integrations) branch on it. Messages are for humans and may change.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>): AppError =>
  new AppError(code, 400, message, details);

export const notFound = (code: string, message: string): AppError => new AppError(code, 404, message);

export const conflict = (code: string, message: string, details?: Record<string, unknown>): AppError =>
  new AppError(code, 409, message, details);

export const unauthorized = (code: string, message: string): AppError => new AppError(code, 401, message);

export const unavailable = (code: string, message: string, details?: Record<string, unknown>): AppError =>
  new AppError(code, 503, message, details);
