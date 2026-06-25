"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { fetchCategoryWikidataNote } from "@/lib/api";
import { withCategoryPrefix } from "@/lib/category";
import type { PendingChange } from "@/lib/pendingChanges";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField, { formFieldInputClassName } from "@/components/ui/FormField";
import WikidataPicker, { type WikidataPickerValue } from "@/components/ui/WikidataPicker";

// A not-yet-published Wikidata edit to this category (the badge already
// shows it via the pending overlay) — reopening the modal must reflect it
// too, otherwise the box looks empty and resubmitting would clear the link.
// `undefined` means no pending rename touches this category's Wikidata link.
function pendingWikidataOverride(
  category: string,
  pendingChanges: PendingChange[],
): WikidataPickerValue | null | undefined {
  const pending = [...pendingChanges]
    .reverse()
    .find(
      (c): c is PendingChange & { type: "rename" } =>
        c.type === "rename" &&
        c.wikidataQid !== undefined &&
        (c.newName === category || c.oldName === category),
    );
  if (!pending) return undefined;
  return pending.wikidataQid ? { id: pending.wikidataQid, label: null } : null;
}

export default function EditCategoryModal({
  category,
  parentCategory,
  onClose,
}: {
  category: string;
  parentCategory: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("rename");
  const { addChange, renameCurrent, confirmedWikidata, pendingChanges } = useBrowser();

  const [name, setName] = useState(category);

  // A sitelink published this session may not be mirrored into Commons'
  // pageprops yet (job-queue lag); prefer the value we know we just set so
  // reopening the modal doesn't read back "no link" — which, resubmitted,
  // would silently clear the real link. `undefined` means no override for
  // this category from either source, so the value below falls through to
  // the Commons lookup.
  const confirmedRaw = confirmedWikidata.get(withCategoryPrefix(category));
  const confirmedOverride: WikidataPickerValue | null | undefined =
    confirmedRaw === undefined ? undefined : confirmedRaw ? { id: confirmedRaw, label: null } : null;
  const pendingOverride = pendingWikidataOverride(category, pendingChanges);
  const override = pendingOverride !== undefined ? pendingOverride : confirmedOverride;

  // Otherwise read the current link from Commons.
  const [fetched, setFetched] = useState<{
    category: string;
    value: WikidataPickerValue | null;
  } | null>(null);

  useEffect(() => {
    if (override !== undefined) return;
    let active = true;
    fetchCategoryWikidataNote(category)
      .then((qid) => {
        if (active) setFetched({ category, value: qid ? { id: qid, label: null } : null });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [category, override]);

  const fetchedValue = fetched?.category === category ? fetched.value : undefined;
  const baseValue = override !== undefined ? override : fetchedValue;
  // Whether we actually know the category's current Wikidata link — false
  // while the lookup is in flight or if it failed. Commons can take a beat
  // to reflect a just-created sitelink (Wikibase Client job queue lag), so a
  // reopened modal can briefly read back "no link" even right after setting
  // one. Submitting that as the truth would silently clear the real link.
  const wikidataLoaded = baseValue !== undefined;

  // The user's own pick/clear in this modal session, keyed by category so it
  // doesn't leak across a category change.
  const [userOverride, setUserOverride] = useState<{
    category: string;
    value: WikidataPickerValue | null;
  } | null>(null);
  const touchedValue = userOverride?.category === category ? userOverride.value : undefined;

  const wikidata = touchedValue !== undefined ? touchedValue : baseValue ?? null;

  function submit() {
    const newName = name.trim();
    if (!newName) return;
    // Only carry a Wikidata change when the user explicitly picked/cleared
    // one, or when the lookup actually loaded (so resubmitting an untouched,
    // successfully-loaded value is a harmless no-op). Otherwise omit it
    // entirely rather than submit an unknown state as "no link".
    const wikidataQid =
      touchedValue !== undefined || wikidataLoaded ? wikidata?.id ?? "" : undefined;
    if (newName === category && wikidataQid === undefined) {
      onClose();
      return;
    }
    addChange({
      id: crypto.randomUUID(),
      type: "rename",
      oldName: category,
      newName,
      parentCategory,
      wikidataQid,
      label:
        newName === category
          ? t("wikidataOnlyLabel", { name: category })
          : t("renameLabel", { oldName: category, newName }),
    });
    if (newName !== category) renameCurrent(newName);
    onClose();
  }

  return (
    <Modal
      title={t("modalTitle")}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("cancel")}
          onConfirm={submit}
          confirmLabel={t("save")}
          confirmDisabled={!name.trim()}
        />
      }
    >
      <FormField label={t("nameLabel")}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={formFieldInputClassName}
        />
      </FormField>

      <FormField label={t("qidLabel")} note={t("qidNote")}>
        <WikidataPicker
          value={wikidata}
          onChange={(v) => setUserOverride({ category, value: v })}
        />
      </FormField>
    </Modal>
  );
}
