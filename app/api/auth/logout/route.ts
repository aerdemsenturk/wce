import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/lib/session";

// GET (not POST) so this can be a plain `<a href>` in UserMenu.
// GET /api/auth/logout
export async function GET(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/", request.url));
}
