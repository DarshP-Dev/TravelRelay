"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeIntentSchema,
  initialIntent,
  intentSchema,
  type TripIntent,
} from "@/lib/trip-intent";
import { useRouter } from "next/navigation";
import { validateGenerationIntent } from "@/lib/itinerary";

type SaveStatus =
  | "loading"
  | "saved"
  | "unsaved"
  | "saving"
  | "error"
  | "expired"
  | "conflict"
  | "completing";
type DraftRecord = { id: string; version: number; data: TripIntent };
class SaveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function jsonResponse<T>(response: Response): Promise<T> {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new SaveError(
      response.status,
      "The server returned an unreadable response. Please retry.",
    );
  }
  if (!response.ok)
    throw new SaveError(
      response.status,
      data.error ?? "We couldn’t save your draft.",
    );
  return data;
}

export function useTripDraft(
  userId: string,
  templateId?: string,
  sourceTripId?: string,
) {
  const router = useRouter();
  const [draft, setDraft] = useState<TripIntent>(() =>
    initialIntent(templateId),
  );
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const record = useRef<DraftRecord | null>(null);
  const latest = useRef(draft);
  const saved = useRef("");
  const initialized = useRef(false);
  const blocked = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const bufferKey = `travelrelay:unsaved:${userId}:${sourceTripId ? `revision:${sourceTripId}` : (templateId ?? "blank")}`;
  const remember = useCallback(() => {
    if (!record.current) return;
    try {
      sessionStorage.setItem(
        bufferKey,
        JSON.stringify({
          id: record.current.id,
          version: record.current.version,
          data: latest.current,
        }),
      );
    } catch {
      /* Server persistence still works when browser storage is unavailable. */
    }
  }, [bufferKey]);
  const forget = useCallback(() => {
    try {
      sessionStorage.removeItem(bufferKey);
    } catch {}
  }, [bufferKey]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (blocked.current || !initialized.current || !record.current)
      return false;
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      setError("");
      setStatus("saving");
      try {
        while (JSON.stringify(latest.current) !== saved.current) {
          const sending = latest.current;
          const active = record.current!;
          const updated = await jsonResponse<DraftRecord>(
            await fetch(`/api/drafts/${active.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ version: active.version, data: sending }),
            }),
          );
          record.current = updated;
          saved.current = JSON.stringify(sending);
          remember();
        }
        forget();
        setStatus("saved");
        return true;
      } catch (cause) {
        remember();
        const code = cause instanceof SaveError ? cause.status : 0;
        blocked.current = code === 401 || code === 409;
        setStatus(
          code === 401 ? "expired" : code === 409 ? "conflict" : "error",
        );
        setError(
          cause instanceof SaveError
            ? cause.message
            : "Connection interrupted. Your latest edits are kept in this tab; retry saving.",
        );
        return false;
      }
    };
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [forget, remember]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await jsonResponse<DraftRecord>(
          await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              sourceTripId
                ? { sourceTripId }
                : templateId
                  ? { templateId }
                  : {},
            ),
            signal: controller.signal,
          }),
        );
        if (!active) return;
        record.current = result;
        saved.current = JSON.stringify(result.data);
        let restored = result.data;
        let conflict = false;
        try {
          const buffer = JSON.parse(
            sessionStorage.getItem(bufferKey) ?? "null",
          );
          if (
            buffer?.id === result.id &&
            intentSchema.safeParse(buffer.data).success &&
            JSON.stringify(buffer.data) !== saved.current
          ) {
            restored = buffer.data;
            conflict = buffer.version !== result.version;
          }
        } catch {}
        latest.current = restored;
        initialized.current = true;
        blocked.current = conflict;
        setReady(true);
        setDraft(restored);
        setStatus(
          conflict
            ? "conflict"
            : JSON.stringify(restored) === saved.current
              ? "saved"
              : "unsaved",
        );
        if (conflict)
          setError(
            "There are unsaved edits from this tab and a newer server draft. Reload the saved version to resolve this conflict.",
          );
      } catch (cause) {
        if (!active) return;
        setStatus(
          cause instanceof SaveError && cause.status === 401
            ? "expired"
            : "error",
        );
        setError(
          cause instanceof SaveError
            ? cause.message
            : "We couldn’t load your draft. Reload to try again; no server draft has been replaced.",
        );
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [templateId, sourceTripId, bufferKey]);

  useEffect(() => {
    if (!initialized.current) return;
    latest.current = draft;
    if (JSON.stringify(draft) === saved.current) return;
    remember();
    setStatus((previous) =>
      ["expired", "conflict", "error", "completing"].includes(previous)
        ? previous
        : previous === "saving"
          ? previous
          : "unsaved",
    );
    const timer = setTimeout(() => {
      void flush();
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, flush, remember]);
  useEffect(() => {
    const protectEdits = (event: BeforeUnloadEvent) => {
      if (
        initialized.current &&
        JSON.stringify(latest.current) !== saved.current
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", protectEdits);
    return () => window.removeEventListener("beforeunload", protectEdits);
  }, []);

  async function saveTrip() {
    const parsed = completeIntentSchema.safeParse(latest.current);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    try {
      validateGenerationIntent(parsed.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Review the trip length before planning.",
      );
      return;
    }
    if (!(await flush())) return;
    setStatus("completing");
    blocked.current = true;
    try {
      const active = record.current!;
      const trip = await jsonResponse<{ id: string }>(
        await fetch(`/api/drafts/${active.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: active.version, data: parsed.data }),
        }),
      );
      forget();
      router.push(`/trips/${trip.id}/generate`);
      router.refresh();
    } catch (cause) {
      const code = cause instanceof SaveError ? cause.status : 0;
      blocked.current = code === 401 || code === 409;
      setStatus(code === 401 ? "expired" : code === 409 ? "conflict" : "error");
      setError(
        cause instanceof SaveError
          ? cause.message
          : "Trip saving couldn’t be confirmed. Retry safely; a duplicate trip will not be created.",
      );
    }
  }
  function reloadSaved() {
    initialized.current = false;
    forget();
    window.location.reload();
  }
  return {
    draft,
    setDraft,
    status,
    error,
    ready,
    flush,
    saveTrip,
    reloadSaved,
  };
}
