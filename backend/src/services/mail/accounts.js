import { tokenStore } from '../../utils/tokenStore.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * The mail accounts this Pulse is signed in to.
 *
 * Mail is the first integration where one provider can hold several accounts —
 * a personal Gmail, a university Outlook — so each gets its own entry in the
 * token store under `mail:<provider>` keyed by an account id, rather than the
 * single `provider:default` entry Spotify and the calendar use.
 *
 * Deliberately separate from the calendar's `google:default` grant. Connecting
 * mail never touches the calendar's sign-in, revoking mail never breaks it, and
 * each holds only the scopes it needs.
 */

const NAMESPACE = 'mail';
const keyOf = (provider) => `${NAMESPACE}:${provider}`;

/** A stable id for an account, so the same mailbox keeps its id across reconnects. */
export function accountId(provider, email) {
  const clean = String(email || '').trim().toLowerCase();
  // Not a hash: the id shows up in URLs and logs, and being able to tell which
  // account a request was for while reading a log is worth more than hiding a
  // local-part from a file only this machine can read.
  return `${provider}-${clean.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Save an account's tokens and identity.
 * The identity (address, display name) is stored beside the tokens so the
 * account list never needs a provider round-trip to render.
 */
export function saveAccount({ provider, email, name, tokens, scopes }) {
  const id = accountId(provider, email);
  tokenStore.set(
    keyOf(provider),
    {
      ...tokens,
      account: { id, provider, email: String(email || '').toLowerCase(), name: name || '', scopes: scopes || null, connectedAt: Date.now() },
    },
    id,
  );
  return id;
}

/** Everything held for one account: tokens plus identity. Null when not connected. */
export function readAccount(provider, id) {
  const entry = tokenStore.get(keyOf(provider), id);
  return entry ? { ...entry, id, provider } : null;
}

/** Replace an account's tokens, keeping its identity. Used after a refresh. */
export function saveTokens(provider, id, tokens) {
  const existing = tokenStore.get(keyOf(provider), id) ?? {};
  tokenStore.set(keyOf(provider), { ...existing, ...tokens }, id);
}

export function forgetAccount(provider, id) {
  tokenStore.clear(keyOf(provider), id);
}

/**
 * Every connected account, as the UI lists them — identity only, never a token.
 *
 * The token store keys are `mail:<provider>:<accountId>`; an account id can
 * itself contain hyphens, so the provider is taken as the second segment and
 * everything after it is the id rather than splitting on every separator.
 */
export function listAccounts() {
  return tokenStore
    .keys(NAMESPACE)
    .map((key) => {
      const [, provider, ...rest] = key.split(':');
      const id = rest.join(':');
      if (!provider || !id) return null;
      const entry = tokenStore.get(keyOf(provider), id);
      if (!entry) return null;
      return {
        id,
        provider,
        email: entry.account?.email ?? '',
        name: entry.account?.name ?? '',
        connectedAt: entry.account?.connectedAt ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.connectedAt ?? 0) - (b.connectedAt ?? 0));
}

/**
 * Resolve an account id to its full entry, or fail clearly.
 *
 * Passing no id picks the only account when there is exactly one, which is what
 * lets every read endpoint work without the caller tracking account ids until
 * it has a reason to.
 */
export function requireAccount(id) {
  const accounts = listAccounts();
  if (!accounts.length) {
    throw ApiError.unauthorized('No mail account connected. Connect one in Settings → Mail.');
  }
  const chosen = id ? accounts.find((a) => a.id === id) : accounts[0];
  if (!chosen) throw ApiError.notFound(`No connected mail account "${id}".`);
  const full = readAccount(chosen.provider, chosen.id);
  if (!full) throw ApiError.unauthorized(`That mail account needs reconnecting.`);
  return full;
}

/**
 * The account for something that must not be guessed at.
 *
 * Reading tolerates a missing id — with one mailbox connected there is nothing
 * to be ambiguous about, and a wrong guess only fails to find the message. But
 * SENDING is different: quietly picking "the first account" when a personal
 * Gmail and a work Outlook are both connected would send from the wrong
 * address, and the user would not find out until a reply arrived somewhere
 * unexpected. So once there is more than one, the caller has to say which.
 */
export function requireNamedAccount(id, action = 'that') {
  const accounts = listAccounts();
  if (!accounts.length) {
    throw ApiError.unauthorized('No mail account connected. Connect one in Settings → Mail.');
  }
  if (!id && accounts.length > 1) {
    throw ApiError.badRequest(
      `Say which account ${action} should come from — ${accounts.map((a) => a.email).join(' or ')}.`,
    );
  }
  return requireAccount(id ?? accounts[0].id);
}

/** Forget every mail account. Used when resetting between tests. */
export function forgetAllAccounts() {
  for (const account of listAccounts()) forgetAccount(account.provider, account.id);
}

/** Accounts to read when none was named: all of them, for the unified views. */
export function accountsFor(id) {
  return id ? [requireAccount(id)] : listAccounts().map((a) => readAccount(a.provider, a.id)).filter(Boolean);
}
