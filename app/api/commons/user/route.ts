import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getUserActivity, getUserUploads } from "@/lib/mediawiki";

// Server-side proxy for the OAuth-connected account's own profile/activity/
// uploads. Single owner-only account (see AGENTS.md) — no user param, no
// multi-account handling.
// GET /api/commons/user?op=profile
// GET /api/commons/user?op=activity&continue=...
// GET /api/commons/user?op=uploads&continue=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const op = searchParams.get("op") ?? "profile";
  const continueToken = searchParams.get("continue") ?? undefined;

  try {
    if (op === "activity") {
      const result = await getUserActivity(continueToken);
      return NextResponse.json(result);
    }
    if (op === "uploads") {
      const result = await getUserUploads(continueToken);
      return NextResponse.json(result);
    }
    const profile = await getCurrentUser();
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
