"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface Toast {
  message: string;
  tone: "error" | "success";
}

interface ToastState {
  toast: Toast | null;
  showToast: (toast: Toast) => void;
}

const Ctx = createContext<ToastState | null>(null);

export function useToast(): ToastState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// Split out of BrowserProvider: a toast fires and clears on its own 4s timer,
// completely unrelated to the rest of the browser state, so keeping it here
// means showing/dismissing a toast no longer re-renders the whole app.
export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const value = useMemo<ToastState>(() => ({ toast, showToast }), [toast, showToast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
