import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getUserActivity, getUserUploads } from "@/lib/mediawiki";
import { isLoginConfigured, refreshSessionIfNeeded } from "@/lib/session";

// Server-side proxy for "my" profile/activity/uploads. Once the per-visitor
// login flow is configured (WIKIMEDIA_OAUTH_LOGIN_*), this reflects whoever
// is actually logged in. Without it, falls back to the legacy single
// owner-only account (see AGENTS.md) — unchanged behavior for a deployment
// that hasn't set up per-visitor login.
// GET /api/commons/user?op=profile
// GET /api/commons/user?op=activity&continue=...
// GET /api/commons/user?op=uploads&continue=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const op = searchParams.get("op") ?? "profile";
  const continueToken = searchParams.get("continue") ?? undefined;

  let token: string | undefined;
  if (isLoginConfigured()) {
    const session = await refreshSessionIfNeeded();
    if (!session) {
      return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    }
    token = session.accessToken;
  }

  try {
    if (op === "activity") {
      const result = await getUserActivity(continueToken, 30, token);
      return NextResponse.json(result);
    }
    if (op === "uploads") {
      const result = await getUserUploads(continueToken, 30, token);
      return NextResponse.json(result);
    }
    const profile = await getCurrentUser(token);
    return NextResponse.json(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    const notConfigured = message.includes("OAuth is not configured");
    return NextResponse.json(
      { error: notConfigured ? "not_configured" : message },
      { status: notConfigured ? 503 : 502 },
    );
  }
}
