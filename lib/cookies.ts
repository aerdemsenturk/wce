// The one place the app touches next/headers. lib/session.ts and i18n/*
// consume this seam instead, so moving off Next means reimplementing only
// this file against the new framework's request-cookie API.

import { cookies } from "next/headers";

export interface CookieSetOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
}

export interface CookieStore {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: CookieSetOptions): void;
  /** `path` must match the path the cookie was set with, or browsers keep it. */
  delete(name: string, options?: { path?: string }): void;
}

/** Cookie store bound to the current request. Writes are only allowed where
 * the framework allows them (route handlers and server actions). */
export async function getCookieStore(): Promise<CookieStore> {
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, options) => store.set(name, value, options),
    delete: (name, options) =>
      options?.path ? store.delete({ name, path: options.path }) : store.delete(name),
  };
}
