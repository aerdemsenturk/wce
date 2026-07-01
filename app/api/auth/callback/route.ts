import { NextResponse, type NextRequest } from "next/server";
import { consumePkceState, createSession } from "@/lib/session";
import { getCurrentUser } from "@/lib/mediawiki";

const TOKEN_ENDPOINT = "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/; read-only browser)";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

// Wikimedia OAuth 2.0 callback: exchange the authorization code for tokens,
// resolve the visitor's username, and start their session. Every failure
// mode here (denied consent, state mismatch, expired exchange) collapses to
// a plain redirect to "/" with no session — no dedicated error page for v1,
// the visitor just lands back in the logged-out state and can try again.
// GET /api/auth/callback?code=...&state=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const callbackUrl = process.env.WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL;
  const home = callbackUrl ? new URL("/", callbackUrl) : new URL("/", request.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(home);
  }

  const codeVerifier = await consumePkceState(state);
  if (!codeVerifier) {
    return NextResponse.redirect(home);
  }

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL ?? "",
      client_id: process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_ID ?? "",
      client_secret: process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_SECRET ?? "",
      code_verifier: codeVerifier,
    }),
  });
  const data = (await tokenRes.json().catch(() => null)) as TokenResponse | null;
  if (!tokenRes.ok || !data?.access_token || !data.refresh_token) {
    console.error("WCE login: token exchange failed", tokenRes.status, data);
    return NextResponse.redirect(home);
  }

  try {
    const profile = await getCurrentUser(data.access_token);
    await createSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      username: profile.username,
      expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
    });
  } catch (err) {
    console.error("WCE login: could not resolve the logged-in account", err);
    return NextResponse.redirect(home);
  }

  return NextResponse.redirect(home);
}
