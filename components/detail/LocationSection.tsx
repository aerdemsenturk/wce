"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Coordinates } from "@/lib/types";
import { reverseGeocode } from "@/lib/nominatim";
import ExternalLink from "@/components/ui/ExternalLink";

// Map only runs client-side (MapLibre touches window at import time).
const LocationMap = dynamic(() => import("./LocationMap"), { ssr: false });

export default function LocationSection({
  coordinates,
  commonsUrl,
}: {
  coordinates: Coordinates | null;
  commonsUrl: string;
}) {
  const t = useTranslations("detail");
  const locale = useLocale();
  const [place, setPlace] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!coordinates) return;
      const name = await reverseGeocode(coordinates.lat, coordinates.lon, locale);
      if (active) setPlace(name);
    };
    void run();
    return () => {
      active = false;
    };
  }, [coordinates, locale]);

  if (!coordinates) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-sm text-slate-400">{t("noLocation")}</span>
        <ExternalLink
          href={commonsUrl}
          className="text-xs text-sky-600 hover:underline"
        >
          {t("addOnCommons")}
        </ExternalLink>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {place && <p className="text-sm text-slate-700">{place}</p>}
      <p className="font-mono text-xs text-slate-500">
        {coordinates.lat.toFixed(5)}, {coordinates.lon.toFixed(5)}
      </p>
      <LocationMap lat={coordinates.lat} lon={coordinates.lon} />
    </div>
  );
}
