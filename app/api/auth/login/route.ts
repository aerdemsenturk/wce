import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createPkceState, isLoginConfigured } from "@/lib/session";

const AUTHORIZE_ENDPOINT = "https://meta.wikimedia.org/w/rest.php/oauth2/authorize";

// Start the per-visitor Wikimedia OAuth 2.0 Authorization Code + PKCE login.
// GET /api/auth/login
export async function GET() {
  if (!isLoginConfigured()) {
    return NextResponse.json({ error: "login_not_configured" }, { status: 503 });
  }

  const { state, codeVerifier } = await createPkceState();
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.WIKIMEDIA_OAUTH_LOGIN_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL!);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(url);
}
