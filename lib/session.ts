// Per-visitor login session: each visitor who logs in with their own
// Wikimedia account gets an encrypted, httpOnly cookie holding their OAuth
// tokens, so writes can be attributed to them instead of the single
// owner-only account `lib/mediawiki.ts` falls back to when no session is
// present. Deliberately has no dependency on lib/mediawiki.ts — route
// handlers are the integration point that reads a token from here and hands
// it to that module, which stays a plain "talk to Wikimedia" client that
// doesn't need to know about cookies or encryption.

import { cookies } from "next/headers";
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";

const OAUTH_TOKEN_ENDPOINT =
  "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/; read-only browser)";

const SESSION_COOKIE = "wce_session";
const PKCE_COOKIE = "wce_oauth_state";
const PKCE_MAX_AGE_S = 600; // the Wikimedia consent screen should take well under 10 minutes
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 180; // refreshed on every use, see refreshSessionIfNeeded
const TOKEN_REFRESH_MARGIN_MS = 60_000; // same margin lib/mediawiki.ts uses for the owner-only token

export interface Session {
  accessToken: string;
  refreshToken: string;
  username: string;
  /** Epoch ms after which the access token should be treated as expired. */
  expiresAt: number;
}

export function isLoginConfigured(): boolean {
  return Boolean(
    process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_ID &&
      process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_SECRET &&
      process.env.WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL,
  );
}

function sessionSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured — required once WIKIMEDIA_OAUTH_LOGIN_* is set.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

// AES-256-GCM: random 12-byte IV + 16-byte auth tag prefixed to the
// ciphertext, base64url-encoded as a single cookie-safe string. Exported
// (alongside decrypt) only so lib/session.test.ts can cover this module's
// one piece of genuinely pure logic directly, without mocking next/headers.
export function encrypt(payload: unknown): string {
  const key = sessionSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

// Returns null on any failure (bad key, tampered value, malformed input)
// rather than throwing — callers treat null as "no valid session".
export function decrypt<T>(value: string): T | null {
  try {
    const key = sessionSecret();
    const raw = Buffer.from(value, "base64url");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function createSession(session: Session): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encrypt(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** Pure read — does not refresh an expiring token. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decrypt<Session>(raw);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_ID ?? "",
      client_secret: process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_SECRET ?? "",
    }),
  });
  return ((await res.json().catch(() => ({}))) as TokenResponse) ?? {};
}

/**
 * Returns a session with a still-valid access token, transparently
 * refreshing it (Wikimedia rotates the refresh token on every use, so the
 * cookie is re-issued too) when it's near expiry. Returns null — and clears
 * the cookie — if there's no session or the refresh fails (revoked/expired
 * refresh token), which callers treat identically to "never logged in".
 */
export async function refreshSessionIfNeeded(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;

  if (session.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return session;
  }

  const data = await exchangeRefreshToken(session.refreshToken);
  if (!data.access_token || !data.refresh_token) {
    await destroySession();
    return null;
  }

  const refreshed: Session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    username: session.username,
    expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
  };
  await createSession(refreshed);
  return refreshed;
}

interface PkceState {
  state: string;
  codeVerifier: string;
}

/** Generates and stashes the PKCE state/verifier pair in a short-lived
 * cookie, scoped to /api/auth so it isn't sent on every other request.
 * `state` is also returned so the login route can put it in the
 * authorize-URL query string — the verifier itself never leaves the
 * cookie, since query strings can leak via referrer headers/logs. */
export async function createPkceState(): Promise<PkceState> {
  const pkce: PkceState = {
    state: randomBytes(16).toString("hex"),
    codeVerifier: randomBytes(32).toString("base64url"),
  };
  const store = await cookies();
  store.set(PKCE_COOKIE, encrypt(pkce), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: PKCE_MAX_AGE_S,
  });
  return pkce;
}

/** Single-use: deletes the cookie unconditionally, returns the stashed
 * code_verifier only if `receivedState` matches what was stored (otherwise
 * null — a CSRF/replay attempt, or the cookie expired before the visitor
 * finished the Wikimedia consent screen). */
export async function consumePkceState(receivedState: string): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PKCE_COOKIE)?.value;
  store.delete({ name: PKCE_COOKIE, path: "/api/auth" });
  if (!raw) return null;
  const pkce = decrypt<PkceState>(raw);
  if (!pkce || pkce.state !== receivedState) return null;
  return pkce.codeVerifier;
}
