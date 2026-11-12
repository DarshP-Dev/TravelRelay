"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, List, MapPin, Plus } from "lucide-react";
import { ItineraryView } from "./itinerary-view";
import { ActivityDetails } from "./activity-details";
import { bookingPaymentLabel } from "@/lib/paypal-status";
import {
  activityCategories,
  clock,
  parseEstimatedCost,
} from "@/lib/activity-metadata";
import {
  categoryFor,
  materializeActivities,
  type EditRequest,
  type EditableActivity,
} from "@/lib/itinerary-editing";
import { money, type SavedActivity } from "@/lib/itinerary";
import {
  dayRoleLabels,
  isTransitDay,
  travelDayRole,
  travelWindow,
} from "@/lib/travel-days";
import type { createItineraryEditor } from "@/server/itinerary-edits";
import type { schedulerChange } from "@/lib/schedule-adapter";
import {
  itineraryUpdatedEvent,
  notifyItineraryChanged,
  type ItineraryUpdate,
} from "@/lib/workspace-events";
type State = Awaited<
  ReturnType<ReturnType<typeof createItineraryEditor>["read"]>
>;
function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
type Preview = Awaited<
  ReturnType<ReturnType<typeof createItineraryEditor>["preview"]>
>;
const VisualSchedule = dynamic(() => import("./visual-schedule"), {
  ssr: false,
  loading: () => <p role="status">Loading visual schedule…</p>,
});
const ActivityMap = dynamic(() => import("./itinerary-map"), {
  ssr: false,
  loading: () => <p role="status">Loading location map…</p>,
});
type FormState = {
  id: string;
  isNew: boolean;
  dayId: string;
  title: string;
  description: string;
  category: EditableActivity["category"];
  location: string;
  latitude: string;
  longitude: string;
  start: string;
  end: string;
  buffer: string;
  cost: string;
  links: EditableActivity["links"];
};
export function ItineraryWorkspace({
  tripId,
  snapshot,
  sandboxBookings,
  recoveryCases,
}: {
  tripId: string;
  snapshot: State;
  sandboxBookings?: import("@/server/paypal-commerce").CommerceState["bookings"];
  recoveryCases?: Record<string, string>;
}) {
  const { intent } = snapshot;
  const router = useRouter(),
    region = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>(snapshot);
  const [ready, setReady] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false),
    [signedOut, setSignedOut] = useState(false);
  const [mode, setMode] = useState<"cards" | "schedule" | "map">("cards"),
    [dayId, setDayId] = useState(""),
    [selected, setSelected] = useState<string>();
  const mapRegion = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [acknowledge, setAcknowledge] = useState(false);
  const url = `/api/trips/${tripId}/itinerary`;
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  async function response<T>(r: Response): Promise<T> {
    let data;
    try {
      data = await r.json();
    } catch {
      throw Error(
        "The saved status could not be read. Check your connection and reload the saved version.",
      );
    }
    if (r.status === 409) setConflict(true);
    if (r.status === 401) setSignedOut(true);
    if (!r.ok)
      throw Error(
        data.error ??
          "This change could not be confirmed. Reload the saved version before retrying.",
      );
    return data;
  }
  const load = useCallback(async () => {
    try {
      const r = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const data: State = await r.json();
      if (!r.ok) {
        if (r.status === 401) setSignedOut(true);
        throw Error(
          (data as unknown as { error: string }).error ??
            "Unable to load itinerary.",
        );
      }
      setState(data);
      setError("");
      setReady(true);
      setConflict(false);
      setSignedOut(false);
      setPreview(null);
      setForm(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connection interrupted. Your saved trip is safe.",
      );
    } finally {
      setBusy(false);
    }
  }, [url]);
  useEffect(() => {
    const sync = (event: Event) => {
      const change = (event as CustomEvent<ItineraryUpdate>).detail;
      if (
        change.tripId !== tripId ||
        !["agent", "wallet"].includes(change.source)
      )
        return;
      if (form || preview) {
        setConflict(true);
        setError(
          "An approved AI proposal changed the saved itinerary. Your unsaved edit is preserved here; reload the saved version before applying it.",
        );
      } else void load();
    };
    window.addEventListener(itineraryUpdatedEvent, sync);
    return () => window.removeEventListener(itineraryUpdatedEvent, sync);
  }, [tripId, form, preview, load]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (form || preview) e.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [form, preview]);
  const plan = preview?.candidate ?? state.itinerary;
  const linkedActivity = hash.startsWith("#activity-")
    ? hash.slice("#activity-".length)
    : "";
  const linkedDay = linkedActivity
    ? plan.days.find((d) => d.activities.some((a) => a.id === linkedActivity))
        ?.id
    : hash.replace("#day-", "");
  const day =
    plan.days.find((d) => d.id === (dayId || linkedDay)) ?? plan.days[0];
  const travel = travelWindow(plan.days.length, plan.base.travelTiming);
  const dayIndex = plan.days.indexOf(day);
  const dayRole = travelDayRole(dayIndex, travel);
  const inTransit = isTransitDay(dayRole);
  const openActivityId = selected ?? linkedActivity;
  useEffect(() => {
    if (linkedActivity && linkedDay === day.id)
      document.getElementById(`activity-${linkedActivity}`)?.scrollIntoView();
  }, [day.id, linkedActivity, linkedDay]);
  const locked = busy || !ready || conflict || signedOut;
  function selectActivity(id: string, focus = true) {
    const targetDay = plan.days.find((entry) =>
      entry.activities.some((activity) => activity.id === id),
    );
    if (!targetDay) return;
    setDayId(targetDay.id);
    setSelected(id);
    if (focus)
      requestAnimationFrame(() => {
        const title = document.getElementById(`activity-detail-title-${id}`);
        title?.focus({ preventScroll: true });
        title?.scrollIntoView({ block: "nearest" });
      });
  }
  function edit(activity?: SavedActivity) {
    if (form || preview) {
      setError("Save or discard the current edit before starting another.");
      return;
    }
    const cost = activity?.costMinor ?? 0;
    setForm({
      id: activity?.id ?? crypto.randomUUID(),
      isNew: !activity,
      dayId: day.id,
      title: activity?.title ?? "",
      description: activity?.description ?? "",
      category: activity ? categoryFor(activity) : "other",
      location: activity?.location ?? "",
      latitude: activity?.latitude?.toString() ?? "",
      longitude: activity?.longitude?.toString() ?? "",
      start: clock(activity?.startMinute ?? 900),
      end: clock(
        activity ? activity.startMinute + activity.durationMinutes : 960,
      ),
      buffer: String(activity?.bufferBeforeMinutes ?? 30),
      cost: String(cost / (plan.currency === "JPY" ? 1 : 100)),
      links: activity?.links ?? [],
    });
    setMessage("");
    setError("");
    requestAnimationFrame(() =>
      region.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }
  async function propose(operation: EditRequest["operation"]) {
    setBusy(true);
    setError("");
    setMessage("");
    setAcknowledge(false);
    try {
      const result = await response<Preview>(
        await fetch(url + "/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: state.version,
            mutationId: crypto.randomUUID(),
            operation,
          }),
          signal: AbortSignal.timeout(15000),
        }),
      );
      setPreview(result);
      requestAnimationFrame(() =>
        region.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to preview. Your saved itinerary is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  function saveForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    try {
      const minute = (text: string) => {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(text))
          throw Error("Use local times in HH:MM format.");
        const [h, m] = text.split(":").map(Number);
        return h * 60 + m;
      };
      const start = minute(form.start),
        end = minute(form.end);
      const data: EditableActivity = {
        title: form.title,
        description: form.description,
        category: form.category,
        location: form.location,
        latitude: form.latitude.trim() === "" ? null : Number(form.latitude),
        longitude: form.longitude.trim() === "" ? null : Number(form.longitude),
        startMinute: start,
        durationMinutes: end - start,
        bufferBeforeMinutes: Number(form.buffer),
        costMinor: parseEstimatedCost(form.cost, plan.currency),
        currency: intent.currency,
        links: form.links,
      };
      void propose({
        action: form.isNew ? "add" : "update",
        activityId: form.id,
        dayId: form.dayId,
        data,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Review the activity fields.",
      );
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await response<State>(
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...preview.request,
            acknowledgeOverBudget: acknowledge,
          }),
          signal: AbortSignal.timeout(15000),
        }),
      );
      setState(result);
      setPreview(null);
      setForm(null);
      setMessage(
        "Changes saved to your account. No AI request or payment was made.",
      );
      router.refresh();
      notifyItineraryChanged(tripId, "manual");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Saving could not be confirmed. Reload the saved version to check before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const discard = () => {
    setForm(null);
    setPreview(null);
    setError("");
    setAcknowledge(false);
    setMessage("Unsaved changes discarded. Your saved itinerary is unchanged.");
  };
  function gesture(change: ReturnType<typeof schedulerChange>) {
    if (form || preview) {
      setError(
        "Save or discard the current proposal before rescheduling another activity.",
      );
      return;
    }
    const a = materializeActivities(state.itinerary)
      .days.flatMap((d) => d.activities)
      .find((a) => a.id === change.activityId)!;
    void propose({
      action: "update",
      activityId: a.id,
      dayId: change.dayId,
      data: {
        title: a.title,
        description: a.description,
        category: a.category!,
        location: a.location,
        latitude: a.latitude,
        longitude: a.longitude,
        startMinute: change.startMinute,
        durationMinutes: change.durationMinutes,
        bufferBeforeMinutes: a.bufferBeforeMinutes,
        costMinor: a.costMinor,
        currency: intent.currency,
        links: a.links ?? [],
      },
    });
  }
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : null));
  return (
    <>
      {preview && (
        <p className="notice" role="status">
          <strong>Unsaved proposal preview.</strong> The figures and schedule
          below show the proposed change. Your saved itinerary is unchanged
          until you confirm.
        </p>
      )}
      <ItineraryView
        itinerary={plan}
        intent={intent}
        presentation="editor"
        tripId={tripId}
      >
        <section className="interactive-itinerary" aria-busy={busy}>
          <div className="editor-toolbar">
            <div>
              <h2>Your schedule</h2>
              <p>
                Local time: {plan.base.timeZone} · Saved revision{" "}
                {state.version}
              </p>
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={locked || !!preview || !!form || inTransit}
              onClick={() => edit()}
            >
              <Plus size={17} aria-hidden="true" /> Add activity
            </button>
          </div>
          {!ready && (
            <p role="status">
              {busy
                ? "Loading saved activities…"
                : "Activities could not be loaded. Reload the saved version to try again."}
            </p>
          )}
          {busy && (
            <p role="status">
              Waiting for the server to confirm this operation…
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {error && (
            <div className="notice" role="alert">
              <strong>
                {conflict
                  ? "This itinerary has a newer saved version."
                  : "Your saved itinerary is safe."}
              </strong>
              <p>{error}</p>
              {signedOut && (
                <Link
                  href={`/login?next=${encodeURIComponent(`/trips/${tripId}/itinerary`)}`}
                >
                  Sign in to resume
                </Link>
              )}
            </div>
          )}
          <div className="editor-actions">
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void load();
              }}
            >
              Reload saved version (discard unsaved edits)
            </button>
            {state.history[0] && (
              <button
                className="button button-secondary"
                disabled={locked || !!form || !!preview}
                onClick={() =>
                  void propose({
                    action: "restore",
                    editId: state.history[0].id,
                  })
                }
              >
                Undo latest saved edit · preview
              </button>
            )}
          </div>
          <nav className="editor-view-switch" aria-label="Itinerary view">
            {(
              [
                ["schedule", "Visual schedule", CalendarDays],
                ["cards", "Chronological cards", List],
                ["map", "Location map", MapPin],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            ))}
          </nav>
          <nav className="itinerary-day-nav" aria-label="Itinerary days">
            {plan.days.map((d, i) => (
              <button
                key={d.id}
                aria-pressed={day.id === d.id}
                onClick={() => {
                  setDayId(d.id);
                  setSelected("");
                  window.history.replaceState(null, "", `#day-${d.id}`);
                }}
              >
                Day {i + 1}
                <small>{d.date}</small>
              </button>
            ))}
          </nav>
          {(form || preview) && (
            <section
              className="activity-edit-panel"
              ref={region}
              aria-label="Activity edit and review"
            >
              {form && !preview && (
                <form onSubmit={saveForm}>
                  <h3>{form.isNew ? "Add your activity" : "Edit activity"}</h3>
                  <p>
                    Dates and times use {plan.base.timeZone}. Estimates cover
                    your whole group in {plan.currency}; they are not payments.
                  </p>
                  <div className="editor-field-grid">
                    <label className="field">
                      Activity title
                      <input
                        required
                        maxLength={160}
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Activity category
                      <select
                        aria-label="Activity category"
                        value={form.category}
                        onChange={(e) =>
                          update(
                            "category",
                            e.target.value as FormState["category"],
                          )
                        }
                      >
                        {activityCategories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field editor-wide">
                      Description
                      <textarea
                        required
                        maxLength={1200}
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Trip date
                      <select
                        aria-label="Trip date"
                        value={form.dayId}
                        onChange={(e) => update("dayId", e.target.value)}
                      >
                        {plan.days.map((d, i) => (
                          <option
                            value={d.id}
                            key={d.id}
                            disabled={isTransitDay(travelDayRole(i, travel))}
                          >
                            Day {i + 1} · {d.date}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Location or address
                      <input
                        required
                        maxLength={200}
                        value={form.location}
                        onChange={(e) => update("location", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Local start (HH:MM)
                      <input
                        required
                        placeholder="18:00"
                        value={form.start}
                        onChange={(e) => update("start", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Local end (HH:MM)
                      <input
                        required
                        placeholder="19:00"
                        value={form.end}
                        onChange={(e) => update("end", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Travel / arrival buffer (minutes)
                      <input
                        type="number"
                        required
                        min={15}
                        max={240}
                        value={form.buffer}
                        onChange={(e) => update("buffer", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Estimated group cost ({plan.currency})
                      <input
                        required
                        inputMode="decimal"
                        value={form.cost}
                        onChange={(e) => update("cost", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Latitude (optional)
                      <input
                        type="number"
                        min={-90}
                        max={90}
                        step="any"
                        value={form.latitude}
                        onChange={(e) => update("latitude", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Longitude (optional)
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step="any"
                        value={form.longitude}
                        onChange={(e) => update("longitude", e.target.value)}
                      />
                    </label>
                  </div>
                  <p className="inline-note">
                    Enter known coordinates or leave both blank. Check
                    coordinates again if you change the address; no location is
                    inferred or verified.
                  </p>
                  <fieldset className="activity-references">
                    <legend>Optional inspiration references</legend>
                    <p>
                      Paste a real public HTTPS link. Posts and creators are not
                      fetched or verified; unavailable content opens at the
                      original source.
                    </p>
                    {form.links.map((link, index) => (
                      <div className="reference-fields" key={index}>
                        <label className="field">
                          Reference label
                          <input
                            required
                            maxLength={80}
                            value={link.label}
                            onChange={(e) =>
                              update(
                                "links",
                                form.links.map((l, i) =>
                                  i === index
                                    ? { ...l, label: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          Reference URL
                          <input
                            type="url"
                            required
                            maxLength={2048}
                            value={link.url}
                            onChange={(e) =>
                              update(
                                "links",
                                form.links.map((l, i) =>
                                  i === index
                                    ? { ...l, url: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() =>
                            update(
                              "links",
                              form.links.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Remove reference {index + 1}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={form.links.length >= 5}
                      onClick={() =>
                        update("links", [...form.links, { label: "", url: "" }])
                      }
                    >
                      Add reference
                    </button>
                  </fieldset>
                  <div className="editor-actions">
                    <button className="button button-primary" disabled={locked}>
                      Preview changes
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={discard}
                    >
                      Discard edit
                    </button>
                  </div>
                </form>
              )}
              {preview && (
                <div className="edit-preview">
                  <h3>
                    {preview.request.operation.action === "delete"
                      ? "Confirm activity deletion"
                      : "Review your changes"}
                  </h3>
                  <p>
                    Nothing is saved yet. Review every changed time and
                    financial estimate below.
                  </p>
                  <ul className="edit-change-list">
                    {preview.changes.map((change) => (
                      <li key={change.activityId}>
                        <strong>
                          {change.after?.activity.title ??
                            change.before?.activity.title}
                        </strong>
                        <span>
                          {change.before
                            ? `${change.before.date} ${clock(change.before.activity.startMinute)}–${clock(change.before.activity.startMinute + change.before.activity.durationMinutes)} · ${money(change.before.activity.costMinor, plan.currency)}`
                            : "New activity"}{" "}
                          →{" "}
                          {change.after
                            ? `${change.after.date} ${clock(change.after.activity.startMinute)}–${clock(change.after.activity.startMinute + change.after.activity.durationMinutes)} · ${money(change.after.activity.costMinor, plan.currency)} · ${change.after.activity.bufferBeforeMinutes} min buffer`
                            : "Delete from itinerary"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p>
                    <strong>
                      Projection change:{" "}
                      {money(preview.budgetDeltaMinor, plan.currency)}{" "}
                      {plan.currency}.
                    </strong>{" "}
                    New allocation + reserve:{" "}
                    {money(plan.totalMinor, plan.currency)}. Reserve:{" "}
                    {money(plan.reserveMinor, plan.currency)}. Unallocated:{" "}
                    {money(plan.budget!.remainingMinor, plan.currency)}.
                  </p>
                  {!!preview.assessment.errors.length && (
                    <div className="notice" role="alert">
                      <strong>Resolve these conflicts before saving.</strong>
                      <ul>
                        {preview.assessment.errors.map((e, i) => (
                          <li key={i}>{e.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!preview.assessment.warnings.length && (
                    <details open className="notice">
                      <summary>Planning suggestions and uncertainties</summary>
                      <ul>
                        {preview.assessment.warnings.map((w, i) => (
                          <li key={i}>{w.message}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {preview.overBudget && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={acknowledge}
                        onChange={(e) => setAcknowledge(e.target.checked)}
                      />
                      I understand this estimate exceeds my budget; the reserve
                      remains separate.
                    </label>
                  )}
                  <div className="editor-actions">
                    <button
                      className="button button-primary"
                      disabled={
                        locked ||
                        !preview.canSave ||
                        (preview.overBudget && !acknowledge)
                      }
                      onClick={() => void commit()}
                    >
                      Confirm & save changes
                    </button>
                    {form && (
                      <button
                        className="button button-secondary"
                        onClick={() => setPreview(null)}
                      >
                        Revise activity
                      </button>
                    )}
                    <button
                      className="button button-secondary"
                      onClick={discard}
                    >
                      Discard proposal
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          {mode === "schedule" && (
            <VisualSchedule
              plan={plan}
              onChange={gesture}
              onSelect={selectActivity}
              disabled={locked || !!preview || !!form}
            />
          )}
          {mode === "map" && (
            <div ref={mapRegion}>
              <ActivityMap day={day} onSelect={selectActivity} />
            </div>
          )}
          <article className="itinerary-day editable-day" id={`day-${day.id}`}>
            <div className="itinerary-day-heading">
              <p className="eyebrow">
                DAY {dayIndex + 1} · {day.date}
              </p>
              {plan.base.travelTiming && (
                <p className="day-role">{dayRoleLabels[dayRole]}</p>
              )}
              {plan.manualEdit && (
                <p className="inline-note">
                  Original day theme · current schedule below
                </p>
              )}
              <h3>{day.title}</h3>
            </div>
            {inTransit && (
              <p className="inline-note">
                Reserved for travel. No local activities are scheduled.
              </p>
            )}
            {!inTransit && !day.activities.length && (
              <div className="editor-empty">
                <h4>A little room to make your own.</h4>
                <p>
                  No activities on this day. Add an activity or move one here
                  using Edit on another day.
                </p>
                <button
                  className="button button-primary"
                  disabled={locked || !!preview || !!form}
                  onClick={() => edit()}
                >
                  Add activity to this day
                </button>
              </div>
            )}
            <ol>
              {day.activities.map((activity, index) => {
                const category = categoryFor(activity, plan, dayIndex, index);
                const expanded = openActivityId === activity.id;
                const assessment = preview?.assessment ?? state.assessment;
                const errors = assessment.errors.filter(
                  (issue) => issue.activityId === activity.id,
                );
                const recovery = recoveryCases?.[activity.id];
                const bookings = sandboxBookings?.filter(
                  (booking) => booking.activityId === activity.id,
                );
                const editable = !locked && !preview && !form;
                return (
                  <li
                    id={`activity-${activity.id}`}
                    key={activity.id}
                    className={`${expanded ? "selected-activity " : ""}${errors.length ? "activity-conflict" : ""}`}
                  >
                    <div className="activity-row">
                      <div className="activity-time">
                        {clock(activity.startMinute)}
                        <span>
                          {clock(
                            activity.startMinute + activity.durationMinutes,
                          )}
                        </span>
                      </div>
                      <div className="activity-row-copy">
                        <h4>{activity.title}</h4>
                        <p className="activity-place">{activity.location}</p>
                        <div className="activity-row-meta">
                          <span
                            className="workspace-pill"
                            data-category={category}
                          >
                            {category}
                          </span>
                          <span>
                            {money(activity.costMinor, plan.currency)}{" "}
                            {plan.currency} est.
                          </span>
                          {activity.origin === "manual" && (
                            <span>Added by you</span>
                          )}
                          {activity.lastEditSource === "ai-proposal" && (
                            <span>Approved AI suggestion</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary activity-details-toggle"
                        aria-expanded={expanded}
                        aria-controls={
                          expanded
                            ? `activity-detail-${activity.id}`
                            : undefined
                        }
                        aria-label={`${expanded ? "Hide" : "View"} details for ${activity.title}`}
                        onClick={() =>
                          expanded
                            ? setSelected("")
                            : selectActivity(activity.id)
                        }
                      >
                        {expanded ? "Hide details" : "View details"}{" "}
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                    {(recovery || !!bookings?.length || !!errors.length) && (
                      <div className="activity-row-status">
                        {recovery && (
                          <Link
                            className="text-link recovery-status-link"
                            href={`/trips/${tripId}/recovery#case-${recovery}`}
                          >
                            Simulated cancellation · View recovery
                          </Link>
                        )}
                        {bookings?.map((booking) => (
                          <Link
                            key={booking.id}
                            className="text-link"
                            href={`/trips/${tripId}/bookings`}
                          >
                            Sandbox demo · {bookingPaymentLabel(booking)}
                          </Link>
                        ))}
                        {errors.map((issue, i) => (
                          <p className="form-error" key={i}>
                            {issue.message}
                          </p>
                        ))}
                      </div>
                    )}
                    {expanded ? (
                      <ActivityDetails
                        key={activity.id}
                        activity={activity}
                        day={day}
                        dayNumber={dayIndex + 1}
                        plan={plan}
                        category={category}
                        interests={intent.selected}
                        reference={assessment.references?.find(
                          (item) => item.activityId === activity.id,
                        )}
                        tripId={tripId}
                        version={state.version}
                        showReviews={!preview}
                        editable={editable}
                        onEdit={() => edit(activity)}
                        onSelect={selectActivity}
                        onClose={() => {
                          setSelected("");
                          requestAnimationFrame(() => {
                            const toggle = document
                              .getElementById(`activity-${activity.id}`)
                              ?.querySelector<HTMLButtonElement>(
                                ".activity-details-toggle",
                              );
                            toggle?.focus({ preventScroll: true });
                            toggle?.scrollIntoView({ block: "nearest" });
                          });
                        }}
                        onMap={() => {
                          setMode("map");
                          requestAnimationFrame(() =>
                            mapRegion.current?.scrollIntoView({
                              block: "start",
                            }),
                          );
                        }}
                      >
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={!editable || index === 0}
                          onClick={() =>
                            void propose({
                              action: "reorder",
                              activityId: activity.id,
                              direction: "earlier",
                            })
                          }
                        >
                          Reorder earlier
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={
                            !editable || index === day.activities.length - 1
                          }
                          onClick={() =>
                            void propose({
                              action: "reorder",
                              activityId: activity.id,
                              direction: "later",
                            })
                          }
                        >
                          Reorder later
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={!editable}
                          onClick={() =>
                            void propose({
                              action: "delete",
                              activityId: activity.id,
                            })
                          }
                          aria-label={`Delete ${activity.title}`}
                        >
                          Delete
                        </button>
                      </ActivityDetails>
                    ) : (
                      <button
                        type="button"
                        className="text-link activity-quick-edit"
                        disabled={!editable}
                        onClick={() => edit(activity)}
                        aria-label={`Edit ${activity.title}`}
                      >
                        Edit activity
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </article>
          <details className="edit-history">
            <summary>
              Saved edit history ({state.history.length}
              {state.history.length === 20 ? " most recent" : ""})
            </summary>
            <ol>
              {state.history.map((entry) => (
                <li key={entry.id}>
                  Revision {entry.version} · {entry.operation.action} ·{" "}
                  {new Date(entry.createdAt).toISOString()} ·{" "}
                  {entry.source === "ai-proposal"
                    ? "Approved AI proposal"
                    : "Manual edit"}{" "}
                  · Planning estimates, no payment
                </li>
              ))}
            </ol>
          </details>
        </section>
      </ItineraryView>
    </>
  );
}
