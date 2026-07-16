/**
 * A typed error carrying an HTTP status code. Throw these from services /
 * providers; the central error handler turns them into clean JSON responses.
 */
export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, opts) {
    return new ApiError(400, message, opts);
  }

  static unauthorized(message = 'Unauthorized', opts) {
    return new ApiError(401, message, opts);
  }

  static notFound(message = 'Not found', opts) {
    return new ApiError(404, message, opts);
  }

  /** Rate limit or usage cap reached. Callers should back off and retry later. */
  static tooManyRequests(message = 'Too many requests', { code = 'RATE_LIMITED', details } = {}) {
    return new ApiError(429, message, { code, details });
  }

  /** A provider integration isn't configured yet (missing API key / OAuth). */
  static notConfigured(integration) {
    return new ApiError(503, `${integration} is not configured. Add its credentials to backend/.env.`, {
      code: 'NOT_CONFIGURED',
      details: { integration },
    });
  }

  /** An upstream provider failed. */
  static upstream(integration, message, details) {
    return new ApiError(502, `${integration} request failed: ${message}`, {
      code: 'UPSTREAM_ERROR',
      details,
    });
  }
}
