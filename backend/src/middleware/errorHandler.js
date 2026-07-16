import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity (4 args).
export function errorHandler(err, req, res, next) {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} →`, err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${statusCode} ${err.message}`);
  }

  res.status(statusCode).json({
    error: {
      message: isApiError ? err.message : 'Internal server error',
      code: err.code,
      details: err.details,
    },
  });
}
