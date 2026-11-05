"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistantState } from "@/server/agent";
import {
  itineraryUpdatedEvent,
  notifyItineraryChanged,
  type ItineraryUpdate,
} from "@/lib/workspace-events";

class AgentApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function json(
  response: Response,
): Promise<AssistantState & { itineraryChanged?: boolean }> {
  let value;
  try {
    value = await response.json();
  } catch {
    throw new AgentApiError(
      response.status,
      "The response could not be read. Check the saved conversation before retrying.",
    );
  }
  if (!response.ok)
    throw new AgentApiError(
      response.status,
      value.error ?? "The assistant is temporarily unavailable.",
    );
  return value;
}
type Pending = {
  action: "send";
  mutationId: string;
  text: string;
  draftVersion: number;
};
export function useTravelAgent(
  initial: AssistantState | null,
  userId: string,
  tripId: string,
) {
  const router = useRouter();
  const [state, setState] = useState(initial),
    [text, setText] = useState(initial?.draft ?? ""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draftStatus, setDraftStatus] = useState("Restoring message draft…"),
    [draftConflict, setDraftConflict] = useState(false),
    [unknownSend, setUnknownSend] = useState(false),
    [expired, setExpired] = useState(false);
  const latest = useRef(initial?.draft ?? ""),
    saved = useRef(initial?.draft ?? ""),
    version = useRef(initial?.draftVersion ?? 0),
    dirty = useRef(false),
    blocked = useRef(false),
    initialized = useRef(false),
    inFlight = useRef<Promise<boolean> | null>(null),
    pending = useRef<Pending | null>(null);
  const url = `/api/trips/${tripId}/assistant`,
    key = `travelrelay:unsaved:${userId}:assistant:${tripId}`;
  const forget = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }, [key]);
  const remember = useCallback(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          text: latest.current,
          version: version.current,
          pending: pending.current,
        }),
      );
    } catch {}
  }, [key]);
  const post = useCallback(
    async (body: unknown) =>
      json(
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        }),
      ),
    [url],
  );
  const accept = useCallback(
    (next: AssistantState, syncDraft = true) => {
      setState((previous) => {
        const turns = [
          ...new Map(
            [...(previous?.turns ?? []), ...next.turns].map((t) => [t.id, t]),
          ).values(),
        ].sort((a, b) => a.ordinal - b.ordinal);
        return {
          ...next,
          turns,
          hasOlder: turns.length > 0 && turns[0].ordinal > 1,
        };
      });
      if (!syncDraft) return;
      if (
        pending.current &&
        next.turns.some((t) => t.mutationId === pending.current?.mutationId)
      ) {
        pending.current = null;
        setUnknownSend(false);
        latest.current = next.draft;
        saved.current = next.draft;
        version.current = next.draftVersion;
        dirty.current = false;
        setText(next.draft);
        setDraftStatus("Message saved to conversation");
        forget();
      } else if (!dirty.current && !inFlight.current && !pending.current) {
        latest.current = next.draft;
        saved.current = next.draft;
        version.current = next.draftVersion;
        setText(next.draft);
      } else if (
        dirty.current &&
        !inFlight.current &&
        next.draftVersion !== version.current
      ) {
        blocked.current = true;
        setDraftConflict(true);
        setDraftStatus("Message draft conflict · your text is preserved");
      }
    },
    [forget],
  );
  const restore = useCallback(
    (next: AssistantState) => {
      setState(next);
      version.current = next.draftVersion;
      saved.current = next.draft;
      latest.current = next.draft;
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(key);
      } catch {}
      let buffer;
      try {
        buffer = raw ? JSON.parse(raw) : null;
      } catch {
        buffer = null;
      }
      if (
        buffer &&
        typeof buffer.text === "string" &&
        buffer.text.length <= 2000 &&
        Number.isSafeInteger(buffer.version)
      ) {
        const sent =
          buffer.pending &&
          next.turns.some((t) => t.mutationId === buffer.pending.mutationId);
        if (sent) forget();
        else {
          latest.current = buffer.text;
          dirty.current = buffer.text !== next.draft;
          if (
            buffer.pending &&
            buffer.pending.action === "send" &&
            typeof buffer.pending.mutationId === "string" &&
            typeof buffer.pending.text === "string"
          ) {
            pending.current = buffer.pending;
            setUnknownSend(true);
          }
          if (dirty.current && buffer.version !== next.draftVersion) {
            blocked.current = true;
            setDraftConflict(true);
          }
        }
      }
      setText(latest.current);
      initialized.current = true;
      setReady(true);
      setExpired(false);
      setDraftStatus(
        blocked.current
          ? "Draft conflict · review before saving"
          : dirty.current
            ? "Unsaved message draft"
            : "Message draft saved",
      );
    },
    [key, forget],
  );
  const refresh = useCallback(
    async (before?: number) => {
      try {
        const next = await json(
          await fetch(url + (before ? `?before=${before}` : ""), {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }),
        );
        if (initialized.current) accept(next);
        else restore(next);
        return next;
      } catch (cause) {
        if (cause instanceof AgentApiError && cause.status === 401)
          setExpired(true);
        setError(
          cause instanceof Error
            ? cause.message
            : "Check your connection and reload the saved conversation.",
        );
        return null;
      }
    },
    [url, accept, restore],
  );
  const flush = useCallback(async (): Promise<boolean> => {
    if (!initialized.current || blocked.current) return false;
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      try {
        while (latest.current !== saved.current) {
          setDraftStatus("Saving message draft…");
          const sending = latest.current,
            next = await post({
              action: "draft",
              text: sending,
              version: version.current,
            });
          version.current = next.draftVersion;
          saved.current = sending;
          accept(next, false);
          remember();
        }
        dirty.current = false;
        setDraftStatus("Message draft saved");
        if (!pending.current) forget();
        return true;
      } catch (cause) {
        remember();
        const code = cause instanceof AgentApiError ? cause.status : 0;
        if (code === 401) {
          setExpired(true);
          blocked.current = true;
        }
        if (code === 409) {
          setDraftConflict(true);
          blocked.current = true;
        }
        setDraftStatus(
          code === 409
            ? "Draft changed in another tab"
            : "Draft save failed · text kept in this tab",
        );
        setError(
          cause instanceof Error
            ? cause.message
            : "Your message draft could not be saved.",
        );
        return false;
      }
    };
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [post, accept, remember, forget]);
  useEffect(() => {
    if (!initial) return;
    let active = true;
    void (async () => {
      try {
        const next = await json(
          await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }),
        );
        if (!active) return;
        restore(next);
      } catch (cause) {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to restore your assistant.",
        );
        if (cause instanceof AgentApiError && cause.status === 401)
          setExpired(true);
      }
    })();
    return () => {
      active = false;
    };
    // The workspace is keyed by trip/user. Route refreshes must not reset drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, restore]);
  useEffect(
    () => () => {
      if (dirty.current && !blocked.current) void flush();
    },
    [flush],
  );
  useEffect(() => {
    if (!ready || !dirty.current) return;
    const timer = setTimeout(() => void flush(), 600);
    return () => clearTimeout(timer);
  }, [text, ready, flush]);
  useEffect(() => {
    if (!ready) return;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ItineraryUpdate>).detail;
      if (detail.tripId === tripId) void refresh();
    };
    const check = () => void refresh();
    window.addEventListener(itineraryUpdatedEvent, onChange);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener(itineraryUpdatedEvent, onChange);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
    };
  }, [ready, tripId, refresh]);
  useEffect(() => {
    if (!ready || !state?.activeTurnId) return;
    const interval = setInterval(() => void refresh(), 2000);
    return () => clearInterval(interval);
  }, [ready, state?.activeTurnId, refresh]);
  function changeText(value: string) {
    latest.current = value;
    dirty.current = value !== saved.current;
    setText(value);
    setDraftStatus("Unsaved message draft");
    remember();
  }
  async function send() {
    if (busy || !latest.current.trim() || !ready) return;
    setBusy(true);
    setError("");
    try {
      if (!pending.current) {
        if (!(await flush())) return;
        pending.current = {
          action: "send",
          mutationId: crypto.randomUUID(),
          text: latest.current.trim(),
          draftVersion: version.current,
        };
        remember();
      }
      const next = await post(pending.current);
      accept(next);
      setUnknownSend(false);
    } catch (cause) {
      if (cause instanceof AgentApiError && cause.status === 401)
        setExpired(true);
      if (cause instanceof AgentApiError && cause.status === 409) {
        pending.current = null;
        setDraftConflict(true);
        blocked.current = true;
        remember();
      } else setUnknownSend(true);
      setError(
        cause instanceof Error
          ? cause.message
          : "Sending could not be confirmed. Check the saved status before retrying the same message.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const next = await post(body);
      accept(next);
      if (next.itineraryChanged) {
        notifyItineraryChanged(tripId, "agent");
        router.refresh();
      }
      return true;
    } catch (cause) {
      if (cause instanceof AgentApiError && cause.status === 401)
        setExpired(true);
      setError(
        cause instanceof Error
          ? cause.message
          : "The action could not be confirmed. Reload its saved status.",
      );
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function resolveDraft(keep: boolean) {
    const next = await refresh();
    if (!next) return;
    version.current = next.draftVersion;
    saved.current = next.draft;
    blocked.current = false;
    setDraftConflict(false);
    if (!keep) {
      latest.current = next.draft;
      dirty.current = false;
      pending.current = null;
      setUnknownSend(false);
      setText(next.draft);
      forget();
      setDraftStatus("Saved draft restored");
    } else {
      dirty.current = latest.current !== saved.current;
      remember();
      await flush();
    }
  }
  return {
    state,
    text,
    ready,
    busy,
    error,
    draftStatus,
    draftConflict,
    unknownSend,
    expired,
    changeText,
    send,
    act,
    refresh,
    flush,
    resolveDraft,
    clearError: () => setError(""),
  };
}
export type TravelAgentController = ReturnType<typeof useTravelAgent>;
