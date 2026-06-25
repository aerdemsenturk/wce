"use client";

import { useToast } from "@/components/ui/ToastProvider";

export default function Toast() {
  const { toast } = useToast();
  if (!toast) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
        toast.tone === "error"
          ? "bg-red-600 text-white"
          : "bg-slate-900 text-white"
      }`}
    >
      {toast.message}
    </div>
  );
}
