"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchPublicUserProfile } from "@/lib/api";
import { useBrowser } from "@/components/browser/BrowserProvider";
import type { UserProfile } from "@/lib/types";
import UploadsView from "./UploadsView";

/** Wide-format profile view reached by picking a user result in the header
 * search: a simple card (username, edit count, registration date) followed
 * by that account's public uploads — parallel to the category view, but for
 * an arbitrary Commons account. */
export default function UserProfileView() {
  const t = useTranslations("userProfile");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { profileUser, setContentView } = useBrowser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!profileUser) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await fetchPublicUserProfile(profileUser);
        if (active) setProfile(result);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [profileUser]);

  if (!profileUser) return null;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between border-b border-border-base pb-3">
        <div>
          <h1 className="text-base font-semibold text-slate-700">{profileUser}</h1>
          {!loading && !error && profile && (
            <p className="text-xs text-slate-400">
              {t("editCount", { count: profile.editCount })}
              {profile.registrationDate &&
                " · " +
                  t("registered", {
                    date: new Date(profile.registrationDate).toLocaleDateString(locale),
                  })}
            </p>
          )}
          {error && <p className="text-xs text-red-500">{t("notFound")}</p>}
        </div>
        <button
          type="button"
          onClick={() => setContentView("category")}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          <BackIcon />
          {t("back")}
        </button>
      </div>

      {loading && <p className="py-16 text-center text-sm text-slate-400">{tc("loading")}</p>}
      {!loading && !error && (
        <UploadsView username={profileUser} emptyLabel={t("uploadsEmpty")} />
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.5 3.5 4 8l5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
