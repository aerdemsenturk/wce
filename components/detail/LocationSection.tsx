"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Coordinates } from "@/lib/types";
import { reverseGeocode } from "@/lib/nominatim";
import { useBrowser } from "@/components/browser/BrowserProvider";
import AddLocationModal from "./AddLocationModal";

// Map only runs client-side (MapLibre touches window at import time).
const LocationMap = dynamic(() => import("./LocationMap"), { ssr: false });

export default function LocationSection({
  title,
  coordinates,
  onSaved,
}: {
  title: string;
  coordinates: Coordinates | null;
  onSaved: (next: Coordinates) => void;
}) {
  const t = useTranslations("detail");
  const locale = useLocale();
  const { addChange } = useBrowser();
  const [place, setPlace] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  function save(lat: number, lon: number) {
    addChange({
      id: crypto.randomUUID(),
      type: "location",
      fileTitle: title,
      lat,
      lon,
      label: t("locationChangeLabel", { name: title.replace(/^File:/i, "") }),
    });
    onSaved({ lat, lon });
  }

  if (!coordinates) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
        >
          {t("addLocation")}
        </button>

        {adding && (
          <AddLocationModal onSave={save} onClose={() => setAdding(false)} />
        )}
      </>
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
