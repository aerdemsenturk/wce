"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchUserProfile } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import LanguageToggle from "./LanguageToggle";

/** Header menu button: opens a dropdown with the OAuth-connected Commons
 * account's profile card, the language switcher, and the activity-history /
 * uploads view switches. Replaces the bare `LanguageToggle` that used to sit
 * directly in the header. */
export default function UserMenu() {
  const t = useTranslations("userMenu");
  const { setContentView } = useBrowser();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || profile || loading) return;
    const load = async () => {
      setLoading(true);
      try {
        setProfile(await fetchUserProfile());
      } catch (err) {
        if (err instanceof Error && err.message === "not_configured") {
          setNotConfigured(true);
        } else if (err instanceof Error && err.message === "not_logged_in") {
          setLoggedOut(true);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, profile, loading]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const initial = profile?.username.charAt(0).toUpperCase() ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("menu")}
        title={t("menu")}
        className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white hover:bg-slate-700"
      >
        {initial ?? <UserIcon />}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-border-base bg-panel py-2 shadow-lg">
          <div className="px-3 py-1.5">
            {notConfigured ? (
              <p className="text-xs text-slate-400">{t("notConfigured")}</p>
            ) : loggedOut ? (
              <a
                href="/api/auth/login"
                className="block rounded-md px-1 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {t("loginWithWikimedia")}
              </a>
            ) : profile ? (
              <a
                href={profile.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {initial}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-700">
                    {profile.username}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {t("edits", { count: profile.editCount })}
                  </span>
                </span>
              </a>
            ) : (
              <p className="text-xs text-slate-400">…</p>
            )}
          </div>

          <div className="my-1.5 border-t border-border-base" />

          <div className="px-3 py-1">
            <span className="mb-1 block text-xs text-slate-400">{t("language")}</span>
            <LanguageToggle />
          </div>

          <div className="my-1.5 border-t border-border-base" />

          <button
            type="button"
            disabled={notConfigured || loggedOut}
            onClick={() => {
              setContentView("activity");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <HistoryIcon />
            {t("viewHistory")}
          </button>
          <button
            type="button"
            disabled={notConfigured || loggedOut}
            onClick={() => {
              setContentView("uploads");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <UploadIcon />
            {t("myUploads")}
          </button>

          {profile && (
            <>
              <div className="my-1.5 border-t border-border-base" />
              <a
                href="/api/auth/logout"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                <LogoutIcon />
                {t("logout")}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 4.5V8l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 2H3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H6M11 11l3-3-3-3M14 8H6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2v8M5 5l3-3 3 3M3 12v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
