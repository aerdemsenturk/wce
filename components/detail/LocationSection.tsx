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
  const { addChange, removeChange } = useBrowser();
  const [place, setPlace] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Id of the queued removeLocation change, if the user has clicked remove.
  const [removedChangeId, setRemovedChangeId] = useState<string | null>(null);

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

  function toggleRemove() {
    if (removedChangeId !== null) {
      removeChange(removedChangeId);
      setRemovedChangeId(null);
      return;
    }
    const id = crypto.randomUUID();
    setRemovedChangeId(id);
    addChange({
      id,
      type: "removeLocation",
      fileTitle: title,
      label: t("removeLocationLabel", { name: title.replace(/^File:/i, "") }),
    });
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

  const removed = removedChangeId !== null;

  return (
    <div className="space-y-2">
      {place && (
        <p className={`text-sm ${removed ? "text-red-500" : "text-slate-700"}`}>{place}</p>
      )}
      <div className="flex items-center gap-1.5">
        <p className={`font-mono text-xs ${removed ? "text-red-500" : "text-slate-500"}`}>
          {coordinates.lat.toFixed(5)}, {coordinates.lon.toFixed(5)}
        </p>
        <button
          type="button"
          onClick={toggleRemove}
          aria-label={removed ? t("undoRemoveLocation") : t("removeLocation")}
          title={removed ? t("undoRemoveLocation") : undefined}
          className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${
            removed
              ? "text-red-400 hover:bg-red-200 hover:text-red-700"
              : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          }`}
        >
          {removed ? <UndoIcon /> : <XIcon />}
        </button>
      </div>
      <LocationMap lat={coordinates.lat} lon={coordinates.lon} />
    </div>
  );
}

function XIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline
        points="9 14 4 9 9 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 20v-7a4 4 0 0 0-4-4H4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
