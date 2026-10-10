import { ApiError } from '../../utils/ApiError.js';
import { readAccount, saveTokens } from './accounts.js';

/**
 * The OAuth bookkeeping both mail providers need, in one place.
 *
 * Follows the pattern the Spotify provider established — refresh ahead of
 * expiry rather than on a 401, and re-store a rotated refresh token — and the
 * one the Google calendar provider established for a grant that has died: clear
 * it, so `connected` stops answering true for an account that can no longer
 * read anything. A mailbox that looks connected and shows no mail is worse than
 * one that says it needs reconnecting.
 */

// Refresh this far ahead of expiry. Generous, because a single list request
// fans out into a message fetch per row and a token must not expire part way
// through one.
const REFRESH_BUFFER_MS = 5 * 60_000;

/** Is this failure the sign-in being dead, rather than this request being wrong? */
export function isDeadGrant(error) {
  const body = error?.details ?? error?.response?.data ?? {};
  const text = `${body.error ?? ''} ${body.error_description ?? ''} ${error?.message ?? ''}`;
  return /invalid_grant|token (?:has been )?(?:expired or )?revoked|AADSTS70008|AADSTS50173|invalid_client/i.test(text);
}

const isAuthFailure = (error) => [401, 403].includes(error?.statusCode ?? error?.status ?? 0);

/**
 * A valid access token for an account, refreshing first if it is close to
 * expiring. `refresh` is the provider's own exchange call.
 */
export async function freshToken({ provider, id, refresh }) {
  const account = readAccount(provider, id);
  if (!account) throw ApiError.unauthorized('That mail account is not connected.');
  if (account.access_token && Date.now() < (account.expires_at ?? 0) - REFRESH_BUFFER_MS) {
    return account.access_token;
  }
  if (!account.refresh_token) {
    throw ApiError.unauthorized('That mail account needs reconnecting — no refresh token was stored.');
  }

  let renewed;
  try {
    renewed = await refresh(account.refresh_token);
  } catch (error) {
    if (isDeadGrant(error)) {
      // Leave the account in place but mark the grant dead, so the UI can offer
      // "Reconnect" against the right address instead of the account vanishing
      // from the list and taking the explanation with it.
      saveTokens(provider, id, { access_token: null, expires_at: 0, deadGrant: true });
      throw ApiError.unauthorized('That mail sign-in has expired — reconnect the account.');
    }
    throw error;
  }

  const next = {
    access_token: renewed.access_token,
    expires_at: Date.now() + (Number(renewed.expires_in) || 3600) * 1000,
    deadGrant: false,
    // Both providers may hand back a new refresh token; losing it would strand
    // the account at the next refresh.
    ...(renewed.refresh_token ? { refresh_token: renewed.refresh_token } : {}),
  };
  saveTokens(provider, id, next);
  return next.access_token;
}

/**
 * Run a provider call, turning a dead sign-in into something the UI can act on
 * and leaving every other failure alone.
 */
export async function authed(provider, id, call) {
  try {
    return await call();
  } catch (error) {
    if (isDeadGrant(error)) {
      saveTokens(provider, id, { access_token: null, expires_at: 0, deadGrant: true });
      throw ApiError.unauthorized('That mail sign-in has expired — reconnect the account.');
    }
    if (isAuthFailure(error)) {
      throw ApiError.unauthorized('The mail provider refused that request. Reconnecting usually fixes it.');
    }
    throw error;
  }
}

/**
 * Run `work` over `items` a few at a time.
 *
 * Both providers need the headers of a page of messages, and both charge per
 * request, so a page is fetched as a bounded fan-out: all at once trips a rate
 * limit on a 50-row page, one at a time makes opening the inbox take a second
 * per message.
 */
export async function pooled(items, limit, work) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await work(items[index], index);
      } catch (error) {
        // One unreadable message must not empty the whole inbox.
        results[index] = { error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}
