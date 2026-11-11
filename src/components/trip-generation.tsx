"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { DestinationImage } from "./destination-image";
import { destinationPhoto, type TripIntent } from "@/lib/trip-intent";
import {
  dateAfter,
  money,
  budgetMinor,
  tripDays,
  type CityProposal,
} from "@/lib/itinerary";
import {
  generationPresentation,
  generationStages as stages,
} from "@/lib/generation-presentation";
import {
  insufficientTravelWindow,
  travelWindow,
  travelWindowLabel,
  type TravelTiming,
} from "@/lib/travel-days";

type Job = {
  status: string;
  proposal: CityProposal | null;
  error: string | null;
  attempts: number;
  confirmed: boolean;
  updatedAt?: string;
};
export function TripGeneration({
  id,
  intent,
}: {
  id: string;
  intent: TripIntent;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsSignin, setNeedsSignin] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [outboundTransitDays, setOutboundTransitDays] = useState("");
  const [returnTransitDays, setReturnTransitDays] = useState("");
  const url = `/api/trips/${id}/generation`;
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15_000),
          ]),
          cache: "no-store",
        });
        const data = await response.json();
        if (alive) setNeedsSignin(response.status === 401);
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Your session expired. Sign in again to resume this trip."
              : data.error || "Unable to check generation.",
          );
        if (!alive) return;
        setJob(data);
        setError("");
        setLoading(false);
        if (
          data &&
          ["queued", "choosing", "generating", "validating"].includes(
            data.status,
          )
        )
          timer = setTimeout(poll, 2000);
      } catch (cause) {
        if (!alive) return;
        setLoading(false);
        setError(
          cause instanceof Error &&
            ![
              "TypeError",
              "TimeoutError",
              "AbortError",
              "SyntaxError",
            ].includes(cause.name)
            ? cause.message
            : "Connection interrupted. Your trip remains saved. Check again when connected.",
        );
      }
    }
    void poll();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, refresh]);
  useEffect(() => {
    const checkStatus = () => setRefresh((value) => value + 1);
    window.addEventListener("online", checkStatus);
    window.addEventListener("focus", checkStatus);
    return () => {
      window.removeEventListener("online", checkStatus);
      window.removeEventListener("focus", checkStatus);
    };
  }, []);
  async function act(
    action: "start" | "confirm" | "retry",
    travelTiming?: TravelTiming,
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, travelTiming }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json();
      setNeedsSignin(response.status === 401);
      if (!response.ok)
        throw new Error(
          data.error || "Generation could not be started. Please retry.",
        );
      setJob(data);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error &&
          !["TypeError", "TimeoutError", "AbortError", "SyntaxError"].includes(
            cause.name,
          )
          ? cause.message
          : "Connection interrupted. Check the saved status before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const photo = destinationPhoto(
    job?.proposal?.city ?? (intent.mode === "known" ? intent.destination : ""),
  );
  const status = job?.status;
  const presentation = generationPresentation(job);
  const current = presentation.stageIndex;
  const totalDays = tripDays(intent);
  const proposal = job?.proposal;
  const legacyTimingReview =
    !!proposal &&
    !proposal.travelTiming &&
    (status === "awaiting_confirmation" ||
      (job?.confirmed && presentation.canRetry));
  const enteredTiming =
    outboundTransitDays !== "" && returnTransitDays !== ""
      ? {
          outboundTransitDays: Number(outboundTransitDays),
          returnTransitDays: Number(returnTransitDays),
        }
      : undefined;
  const timing = proposal?.travelTiming ?? enteredTiming;
  const travel = timing ? travelWindow(totalDays, timing) : undefined;
  const showProposal =
    proposal && (status === "awaiting_confirmation" || legacyTimingReview);
  return (
    <div className="container generation-page">
      <div className="generation-scene">
        <DestinationImage
          src={photo?.image ?? "/images/cinque-terre.jpg"}
          alt={photo?.alt ?? "Cinque Terre coast — default travel inspiration"}
          priority
          sizes="100vw"
        />
        <div className="generation-scrim" />
        <div className="generation-copy">
          <p className="eyebrow">
            <Sparkles size={16} aria-hidden="true" /> A JOURNEY, JUST FOR YOU
          </p>
          <h1>
            {status === "complete"
              ? "Your next chapter awaits."
              : job?.proposal
                ? `A little more ${job.proposal.city}.`
                : "Let’s make room for wonder."}
          </h1>
          <p>
            {status === "complete"
              ? "Your complete itinerary has been validated and saved to your account."
              : "Thoughtful days, a pace that feels like you, and space for the unexpected."}
          </p>
          <span className="generation-photo-label">
            {photo
              ? `${photo.city} · Destination inspiration`
              : "Cinque Terre · Default travel inspiration"}
          </span>
        </div>
      </div>
      <section className="generation-panel panel" aria-busy={busy || loading}>
        <div className="generation-heading">
          <span className="eyebrow">YOUR TRIP, TAKING SHAPE</span>
          <h2>
            {status === "complete"
              ? "Ready when you are."
              : status === "awaiting_confirmation"
                ? "One place to call your base."
                : status === "failed"
                  ? "Let’s find the next step."
                  : "Good things take a little thought."}
          </h2>
          <p>
            {intent.travelers}{" "}
            {intent.travelers === 1 ? "traveler" : "travelers"} · {totalDays}{" "}
            travel-window {totalDays === 1 ? "day" : "days"} ·{" "}
            {money(budgetMinor(intent), intent.currency)} {intent.currency} ·{" "}
            {intent.pace}
          </p>
        </div>
        {!loading && (
          <p
            role="status"
            aria-live="polite"
            className="generation-status-message"
          >
            {presentation.message}
          </p>
        )}
        {job && (
          <p className="inline-note">
            {job.confirmed ? "Itinerary" : "Destination"} attempts used:{" "}
            {job.attempts} of 3.{" "}
            {job.updatedAt && (
              <>
                Saved update:{" "}
                <time dateTime={job.updatedAt}>
                  {job.updatedAt.replace("T", " ").slice(0, 19)} UTC
                </time>
                .
              </>
            )}
          </p>
        )}
        {status &&
          ["queued", "choosing", "generating", "validating"].includes(
            status,
          ) && (
            <p className="inline-note" role="status">
              Planning can take a minute or two. Your input and progress are
              saved; you can return to this trip to check its status.
            </p>
          )}
        {loading && (
          <p role="status">
            <LoaderCircle className="generation-spinner" size={18} /> Restoring
            your saved progress…
          </p>
        )}
        {!loading && (
          <ol
            className="generation-stages"
            aria-label="Backend generation stages"
          >
            {stages.map((stage, index) => (
              <li
                key={stage.key}
                aria-current={index === current ? "step" : undefined}
              >
                <span className="generation-step">
                  {index < current ? <Check size={16} /> : index + 1}
                </span>
                <div>
                  <strong>{stage.label}</strong>
                  <p>{stage.description}</p>
                  {index === current &&
                    ["choosing", "generating", "validating", "queued"].includes(
                      status ?? "",
                    ) && (
                      <span role="status">
                        In progress{" "}
                        <LoaderCircle
                          className="generation-spinner"
                          size={14}
                        />
                      </span>
                    )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {showProposal && (
          <div className="generation-confirm">
            <h3>
              {proposal.city}, {proposal.country}
            </h3>
            <p>{proposal.explanation}</p>
            <p>
              <strong>
                {proposal.startDate} →{" "}
                {dateAfter(proposal.startDate, totalDays - 1)}
              </strong>{" "}
              · {proposal.timeZone}
            </p>
            {legacyTimingReview && (
              <>
                <p>
                  Review the saved assumptions. Choose how many whole dates are
                  reserved for transit before arrival and after departure.
                  Choose zero when travel and arrival or departure share a date.
                </p>
                <div className="field-grid">
                  {[
                    {
                      label: "Outbound transit days",
                      value: outboundTransitDays,
                      set: setOutboundTransitDays,
                    },
                    {
                      label: "Return transit days",
                      value: returnTransitDays,
                      set: setReturnTransitDays,
                    },
                  ].map(({ label, value, set }) => (
                    <label className="field" key={label}>
                      {label}
                      <select
                        value={value}
                        onChange={(event) => set(event.target.value)}
                      >
                        <option value="">Select days</option>
                        {Array.from({ length: totalDays }, (_, count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}
            {travel?.fits && (
              <>
                <p>{travelWindowLabel(travel)}</p>
                <p>
                  Assumed local {travel.totalDays === 1 ? "visit" : "arrival"}{" "}
                  {dateAfter(proposal.startDate, travel.arrivalIndex)}
                  {travel.totalDays > 1 && (
                    <>
                      {" "}
                      · Leave the destination{" "}
                      {dateAfter(proposal.startDate, travel.departureIndex)}
                    </>
                  )}
                </p>
              </>
            )}
            {travel && !travel.fits && (
              <p role="alert">{insufficientTravelWindow}</p>
            )}
            <p>
              Local activities stay in this base city. Review the tentative
              timing against your travel arrangements. Flights and lodging are
              unverified.
            </p>
            <button
              className="button button-primary"
              disabled={busy || needsSignin || !travel?.fits}
              onClick={() =>
                void act(
                  status === "failed" ? "retry" : "confirm",
                  legacyTimingReview ? enteredTiming : undefined,
                )
              }
            >
              {busy
                ? "Starting…"
                : status === "failed"
                  ? "Confirm timing & retry itinerary"
                  : "Confirm city & generate my trip"}
            </button>
          </div>
        )}
        {(error || job?.error) && (
          <div className="notice" role="alert">
            <strong>Your input is safe.</strong>
            <p>{error || job?.error}</p>
            {error && (
              <button
                className="button button-secondary"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Check saved status
              </button>
            )}
            {needsSignin && (
              <Link
                className="section-link"
                href={`/login?next=${encodeURIComponent(`/trips/${id}/generate`)}`}
              >
                Sign in to resume
              </Link>
            )}
          </div>
        )}
        {!loading && !job && (
          <button
            className="button button-primary"
            disabled={busy || !!error}
            onClick={() => void act("start")}
          >
            {busy ? "Starting…" : "Find my base city"}
          </button>
        )}
        {presentation.canRetry && !legacyTimingReview && (
          <button
            className="button button-primary"
            disabled={busy || needsSignin}
            onClick={() => void act("retry")}
          >
            {busy ? "Retrying…" : "Retry AI planning"}
          </button>
        )}
        {status === "failed" && job && job.attempts >= 3 && (
          <p className="inline-note">
            This planning phase has reached its three-attempt limit. Your saved
            input is unchanged. Adjust a copy of your preferences to plan again.
          </p>
        )}
        {status === "complete" && (
          <Link className="button button-primary" href={`/trips/${id}`}>
            Explore My Trip
          </Link>
        )}
        <p className="inline-note">
          Your original trip intent remains saved throughout. You can leave this
          page and return from My Trips. Individual days stay hidden until the
          complete plan passes validation. A 10% reserve is included; prices and
          schedules are unverified estimates.
        </p>
        <Link href={`/trips/${id}`} className="section-link">
          Back to saved trip
        </Link>
        {status !== "complete" && (
          <Link href={`/trips/new?source=${id}`} className="section-link">
            Adjust a copy of my saved preferences
          </Link>
        )}
        <Link href="/example-trip" className="section-link">
          View the labeled example trip · no AI required
        </Link>
      </section>
    </div>
  );
}
