"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField, { formFieldInputClassName } from "@/components/ui/FormField";

// Map only runs client-side (MapLibre touches window at import time).
const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), { ssr: false });

/** Parses "lat, lon" (comma/semicolon/space separated, dot decimals). */
function parseCombinedCoordinate(raw: string): { lat: number; lon: number } | null {
  const parts = raw.trim().split(/[,;]\s*|\s+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const lat = Number.parseFloat(parts[0]);
  const lon = Number.parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export default function AddLocationModal({
  onSave,
  onClose,
}: {
  onSave: (lat: number, lon: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("detail");
  const [coordText, setCoordText] = useState("");

  const parsed = parseCombinedCoordinate(coordText);

  function submit() {
    if (!parsed) return;
    onSave(parsed.lat, parsed.lon);
    onClose();
  }

  function pickFromMap(lat: number, lon: number) {
    setCoordText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  }

  return (
    <Modal
      title={t("addLocationTitle")}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("cancel")}
          onConfirm={submit}
          confirmLabel={t("save")}
          confirmDisabled={!parsed}
        />
      }
    >
      <div className="space-y-3">
        <FormField label={t("coordinates")} note={t("coordinatesNote")}>
          <input
            autoFocus
            value={coordText}
            onChange={(e) => setCoordText(e.target.value)}
            placeholder="41.0082, 28.9784"
            className={formFieldInputClassName}
          />
        </FormField>

        <LocationPickerMap value={parsed} onPick={pickFromMap} />
      </div>
    </Modal>
  );
}
