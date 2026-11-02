"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Appel d'une route Mission puis rafraîchissement de la page ; erreur lisible en cas d'échec. */
export function useMissionAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<any | null> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: init.method ?? "POST",
        headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Erreur (HTTP ${res.status}).`);
      router.refresh();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy, error, setError };
}
