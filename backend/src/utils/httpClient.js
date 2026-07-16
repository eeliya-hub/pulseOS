import { ApiError } from './ApiError.js';

/**
 * Thin wrapper around global fetch (Node 18+) for talking to upstream provider
 * APIs. Adds a timeout, JSON parsing, and consistent error surfacing so every
 * provider handles failures the same way.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.integration] label used in error messages
 * @param {number} [options.timeoutMs]
 */
export async function fetchJson(url, { integration = 'upstream', timeoutMs = 10_000, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw ApiError.upstream(integration, `timed out after ${timeoutMs}ms`);
    }
    throw ApiError.upstream(integration, err.message);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const body = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = body?.message || body?.error?.message || body?.error || response.statusText;
    throw ApiError.upstream(integration, `${response.status} ${message}`, body ?? undefined);
  }

  return body;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Like fetchJson but returns the raw response text (e.g. RSS/XML feeds). */
export async function fetchText(url, { integration = 'upstream', timeoutMs = 12_000, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw ApiError.upstream(integration, err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err.message);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw ApiError.upstream(integration, `${response.status} ${response.statusText}`);
  }
  return response.text();
}
