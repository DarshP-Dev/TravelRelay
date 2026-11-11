"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTripDraft } from "./use-trip-draft";
import { WizardPreview } from "./wizard-preview";
import type { TripIntent } from "@/lib/trip-intent";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { interests, type CuratedTrip } from "@/lib/curated-trips";
import { tripDays } from "@/lib/trip-intent";

const steps = ["Destination", "Trip details", "Budget", "Preferences"];

export function TripWizard({
  template,
  userId,
  sourceTripId,
}: {
  template?: CuratedTrip;
  userId: string;
  sourceTripId?: string;
}) {
  const {
    draft,
    setDraft,
    status,
    error,
    ready,
    flush,
    saveTrip,
    reloadSaved,
  } = useTripDraft(userId, template?.id, sourceTripId);
  const {
    step,
    review,
    mode,
    destination,
    vibe,
    departure,
    start,
    end,
    flexible,
    month,
    duration,
    travelers,
    pace,
    budget,
    currency,
    scope,
    style,
    selected,
    mustSee,
    avoids,
    dietary,
    accessibility,
  } = draft;
  const [dateError, setDateError] = useState("");
  function update<K extends keyof TripIntent>(field: K, value: TripIntent[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }
  const setStep = (value: TripIntent["step"]) => update("step", value);
  const setReview = (value: TripIntent["review"]) => update("review", value);
  const setMode = (value: TripIntent["mode"]) => update("mode", value);
  const setDestination = (value: TripIntent["destination"]) =>
    update("destination", value);
  const setVibe = (value: TripIntent["vibe"]) => update("vibe", value);
  const setDeparture = (value: TripIntent["departure"]) =>
    update("departure", value);
  const setStart = (value: TripIntent["start"]) => update("start", value);
  const setEnd = (value: TripIntent["end"]) => update("end", value);
  const setFlexible = (value: TripIntent["flexible"]) =>
    update("flexible", value);
  const setMonth = (value: TripIntent["month"]) => update("month", value);
  const setDuration = (value: TripIntent["duration"]) =>
    update("duration", value);
  const setTravelers = (value: TripIntent["travelers"]) =>
    update("travelers", value);
  const setPace = (value: TripIntent["pace"]) => update("pace", value);
  const setBudget = (value: TripIntent["budget"]) => update("budget", value);
  const setCurrency = (value: TripIntent["currency"]) =>
    update("currency", value);
  const setScope = (value: TripIntent["scope"]) => update("scope", value);
  const setStyle = (value: TripIntent["style"]) => update("style", value);
  const setSelected = (value: TripIntent["selected"]) =>
    update("selected", value);
  const setMustSee = (value: TripIntent["mustSee"]) => update("mustSee", value);
  const setAvoids = (value: TripIntent["avoids"]) => update("avoids", value);
  const setDietary = (value: TripIntent["dietary"]) => update("dietary", value);
  const setAccessibility = (value: TripIntent["accessibility"]) =>
    update("accessibility", value);
  const titleRef = useRef<HTMLHeadingElement>(null);

  function navigate(nextStep: number, isReview = false) {
    setStep(nextStep);
    setReview(isReview);
    requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView({ block: "center" });
    });
  }

  const budgetLabel = budget
    ? new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "JPY" ? 0 : 2,
      }).format(Number(budget)) + ` ${currency}`
    : "Not specified";
  const dateLabel = flexible
    ? `${month || "Month to decide"} · ${duration} days`
    : `${start || "Start to decide"} → ${end || "End to decide"}`;

  return (
    <>
      <div className="notice draft-status" aria-live="polite">
        <strong>
          {status === "loading"
            ? "Restoring your draft…"
            : status === "saved"
              ? "All changes saved"
              : status === "saving"
                ? "Saving draft…"
                : status === "completing"
                  ? "Saving your trip intent…"
                  : status === "unsaved"
                    ? "Unsaved changes"
                    : status === "expired"
                      ? "Sign in to resume saving"
                      : status === "conflict"
                        ? "Draft conflict"
                        : "Draft needs attention"}
        </strong>
        <p>
          Your draft autosaves to your account. Next, confirm one base city
          before real AI itinerary generation. Your original input stays saved.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {status === "expired" && (
          <Link
            className="section-link"
            href={`/login?next=${encodeURIComponent(`/trips/new${sourceTripId ? `?source=${sourceTripId}` : template ? `?template=${template.id}` : ""}`)}`}
          >
            Sign in and restore your draft
          </Link>
        )}
        {status === "error" && (
          <button
            className="button button-secondary"
            onClick={() => {
              if (ready) void flush();
              else window.location.reload();
            }}
          >
            {ready ? "Retry saving" : "Retry loading"}
          </button>
        )}
        {["conflict", "error"].includes(status) && (
          <button className="button button-secondary" onClick={reloadSaved}>
            Reload saved version (discard unsaved edits)
          </button>
        )}
      </div>
      {template && (
        <div className="notice template-personalization">
          <strong>Inspired by {template.title}</strong>
          <p>
            We’ve suggested one destination and interests. Choose your own
            dates, confirm your travelers and enter a group budget. Every
            preference is editable; the template’s per-person estimate is not
            your budget or a booking.
          </p>
          <Link className="section-link" href={`/explore/${template.id}`}>
            Review this inspiration
          </Link>
        </div>
      )}
      <ol className="wizard-steps" aria-label="Trip planning steps">
        {steps.map((label, index) => (
          <li
            key={label}
            className={
              index === step && !review
                ? "current"
                : index < step || review
                  ? "complete"
                  : ""
            }
            aria-current={index === step && !review ? "step" : undefined}
          >
            <span>
              {index < step || review ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                `0${index + 1}`
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="wizard-layout">
        <section className="wizard-panel panel">
          <fieldset
            className="wizard-lock"
            disabled={
              !ready ||
              ["loading", "expired", "conflict", "completing"].includes(status)
            }
          >
            <div className="wizard-panel-heading">
              <p className="eyebrow">
                {review ? "YOUR TRIP, AT A GLANCE" : `STEP 0${step + 1} OF 04`}
              </p>
              <h2 tabIndex={-1} ref={titleRef}>
                {review
                  ? "A little closer to your next adventure."
                  : [
                      "Where are we dreaming of?",
                      "Let’s make it your time.",
                      "Find your comfort zone.",
                      "It’s the little things that make it yours.",
                    ][step]}
              </h2>
              <p>
                {review
                  ? "Review your trip intent. Your draft is saved separately; an itinerary has not been generated."
                  : [
                      "Start with a destination, or tell us the feeling you’re after.",
                      "Give your trip a little shape, with room to make it your own.",
                      "Choose a planning budget in the currency you think in.",
                      "Share what you love. Everything on this step is optional.",
                    ][step]}
              </p>
            </div>
            {review ? (
              <div className="review-content">
                <dl className="review-list">
                  <div>
                    <dt>Destination</dt>
                    <dd>
                      {mode === "known"
                        ? destination
                        : `Help me decide: ${vibe}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Leaving from</dt>
                    <dd>{departure}</dd>
                  </div>
                  <div>
                    <dt>Dates</dt>
                    <dd>{dateLabel}</dd>
                  </div>
                  <div>
                    <dt>Travelers & pace</dt>
                    <dd>
                      {travelers} · {pace}
                    </dd>
                  </div>
                  <div>
                    <dt>Budget</dt>
                    <dd>
                      {budgetLabel} ·{" "}
                      {scope === "entire" ? "Entire vacation" : "Spending only"}
                    </dd>
                  </div>
                  <div>
                    <dt>Spending style</dt>
                    <dd>{style}</dd>
                  </div>
                  <div>
                    <dt>Interests</dt>
                    <dd>{selected.join(", ") || "Open to discovery"}</dd>
                  </div>
                  {[
                    ["Must-see", mustSee],
                    ["Avoids", avoids],
                    ["Dietary", dietary],
                    ["Accessibility", accessibility],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
                <p className="inline-note">
                  This form does not confirm a base city, check availability,
                  convert currencies, or validate a trip’s cost. Country and
                  vibe matching will require a confirmed single base city before
                  generation.
                </p>
                <div className="wizard-controls">
                  <button
                    className="button button-secondary"
                    onClick={() => navigate(3)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Edit preferences
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={[
                      "loading",
                      "saving",
                      "completing",
                      "conflict",
                      "expired",
                    ].includes(status)}
                    onClick={() => {
                      void saveTrip();
                    }}
                  >
                    {status === "completing"
                      ? "Saving…"
                      : "Save & continue to AI planning"}
                  </button>
                </div>
                <ButtonLink href="/trips/preview" variant="text">
                  Look around the layout preview{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </ButtonLink>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (step === 1) {
                    // Read native date controls at submission as well as tracking edits.
                    const fields = new FormData(event.currentTarget);
                    const nextStart = String(fields.get("start") ?? "");
                    const nextEnd = String(fields.get("end") ?? "");
                    if (!flexible && nextEnd < nextStart) {
                      setDateError(
                        "Choose an end date on or after your start date.",
                      );
                      return;
                    }
                    if (
                      tripDays({
                        flexible,
                        duration,
                        start: nextStart,
                        end: nextEnd,
                      }) > 14
                    ) {
                      setDateError(
                        "AI planning supports 1–14 days. Choose a shorter stay; your other preferences are kept.",
                      );
                      return;
                    }
                    setDateError("");
                    if (flexible) setMonth(String(fields.get("month") ?? ""));
                    else {
                      setStart(nextStart);
                      setEnd(nextEnd);
                    }
                  }
                  if (step === 3) navigate(3, true);
                  else navigate(step + 1);
                }}
              >
                {step === 0 && (
                  <div className="form-fields">
                    <fieldset>
                      <legend>How would you like to start?</legend>
                      <div className="choice-grid">
                        {[
                          {
                            value: "known",
                            label: "I know where",
                            text: "There’s a place on my mind.",
                            icon: Compass,
                          },
                          {
                            value: "discover",
                            label: "Help me decide",
                            text: "I’m following a feeling.",
                            icon: Sparkles,
                          },
                        ].map((choice) => (
                          <label
                            key={choice.value}
                            className={`choice-card ${mode === choice.value ? "selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="destination-mode"
                              value={choice.value}
                              checked={mode === choice.value}
                              onChange={() =>
                                setMode(choice.value as TripIntent["mode"])
                              }
                            />
                            <choice.icon size={23} aria-hidden="true" />
                            <strong>{choice.label}</strong>
                            <span>{choice.text}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {mode === "known" ? (
                      <label className="field">
                        City, country, or region
                        <input
                          value={destination}
                          onChange={(event) =>
                            setDestination(event.target.value)
                          }
                          placeholder="e.g. Kyoto, Japan"
                          required
                          maxLength={120}
                        />
                        <span>
                          We’ll plan around one base city. Country or region
                          choices will need your confirmation of one base city.
                        </span>
                      </label>
                    ) : (
                      <label className="field">
                        What kind of escape are you after?
                        <textarea
                          value={vibe}
                          onChange={(event) => setVibe(event.target.value)}
                          placeholder="Warm weather, good food, and a slower pace…"
                          required
                          maxLength={1000}
                          rows={4}
                        />
                        <span>
                          We’ll suggest one base city for you to confirm after
                          reviewing your preferences.
                        </span>
                      </label>
                    )}
                  </div>
                )}
                {step === 1 && (
                  <div className="form-fields">
                    <label className="field">
                      Departure city
                      <input
                        value={departure}
                        onChange={(event) => setDeparture(event.target.value)}
                        placeholder="e.g. Toronto, Canada"
                        required
                        maxLength={120}
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={flexible}
                        onChange={(event) => setFlexible(event.target.checked)}
                      />
                      My dates are flexible
                    </label>
                    {flexible ? (
                      <div className="field-grid">
                        <label className="field">
                          Approximate month
                          <input
                            type="month"
                            name="month"
                            value={month}
                            onChange={(event) => setMonth(event.target.value)}
                            required
                          />
                        </label>
                        <label className="field">
                          Trip length (days)
                          <input
                            type="number"
                            min={1}
                            max={14}
                            value={duration}
                            onChange={(event) =>
                              setDuration(Number(event.target.value))
                            }
                            required
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="field-grid">
                        <label className="field">
                          Start date
                          <input
                            type="date"
                            name="start"
                            value={start}
                            onChange={(event) => setStart(event.target.value)}
                            required
                          />
                        </label>
                        <label className="field">
                          End date
                          <input
                            type="date"
                            name="end"
                            min={start || undefined}
                            value={end}
                            onChange={(event) => setEnd(event.target.value)}
                            required
                          />
                        </label>
                      </div>
                    )}
                    {dateError && (
                      <p role="alert" className="form-error">
                        {dateError}
                      </p>
                    )}
                    <p className="inline-note">
                      AI planning supports 1–14 days. Exact arrival and
                      departure times are not collected; travel-day windows will
                      be disclosed assumptions.
                    </p>
                    <div className="field">
                      <span id="travelers-label">Travelers</span>
                      <div
                        className="counter"
                        role="group"
                        aria-labelledby="travelers-label"
                      >
                        <button
                          type="button"
                          aria-label="Remove a traveler"
                          disabled={travelers <= 1}
                          onClick={() => setTravelers(travelers - 1)}
                        >
                          <Minus size={18} aria-hidden="true" />
                        </button>
                        <output aria-live="polite">{travelers}</output>
                        <button
                          type="button"
                          aria-label="Add a traveler"
                          disabled={travelers >= 20}
                          onClick={() => setTravelers(travelers + 1)}
                        >
                          <Plus size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {draft.templateId && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          required
                          checked={draft.travelersConfirmed ?? false}
                          onChange={(event) =>
                            update("travelersConfirmed", event.target.checked)
                          }
                        />
                        Confirm {travelers}{" "}
                        {travelers === 1 ? "traveler" : "travelers"} for this
                        trip
                      </label>
                    )}
                    <label className="field">
                      Your pace
                      <select
                        value={pace}
                        onChange={(event) =>
                          setPace(event.target.value as TripIntent["pace"])
                        }
                      >
                        <option value="relaxed">
                          Relaxed — time to linger
                        </option>
                        <option value="balanced">
                          Balanced — a little of everything
                        </option>
                        <option value="packed">
                          Packed — make the most of every day
                        </option>
                      </select>
                    </label>
                  </div>
                )}
                {step === 2 && (
                  <div className="form-fields">
                    <div className="field-grid budget-fields">
                      <label className="field">
                        Total trip budget
                        <input
                          type="number"
                          min={1}
                          max={1000000000}
                          step={currency === "JPY" ? "1" : "0.01"}
                          value={budget}
                          onChange={(event) => setBudget(event.target.value)}
                          placeholder="2500"
                          required
                        />
                      </label>
                      <label className="field">
                        Primary currency
                        <select
                          value={currency}
                          onChange={(event) =>
                            setCurrency(
                              event.target.value as TripIntent["currency"],
                            )
                          }
                        >
                          {["CAD", "USD", "EUR", "GBP", "JPY", "AUD"].map(
                            (code) => (
                              <option key={code}>{code}</option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    <p className="inline-note">
                      Use your total for all travelers. Selecting a currency
                      only changes the denomination; it does not convert the
                      amount. Template illustrations are per person; enter your
                      own group budget here.
                    </p>
                    <label className="field">
                      What does this budget cover?
                      <select
                        value={scope}
                        onChange={(event) =>
                          setScope(event.target.value as TripIntent["scope"])
                        }
                      >
                        <option value="entire">
                          Entire vacation — including travel & accommodation
                        </option>
                        <option value="spending">
                          Spending only — flights & accommodation covered
                        </option>
                      </select>
                    </label>
                    <label className="field">
                      Spending style
                      <select
                        value={style}
                        onChange={(event) =>
                          setStyle(event.target.value as TripIntent["style"])
                        }
                      >
                        <option value="budget-friendly">Budget-friendly</option>
                        <option value="balanced">Balanced</option>
                        <option value="premium">Premium</option>
                      </select>
                    </label>
                    <div className="notice compact">
                      <strong>A little breathing room matters.</strong>
                      <p>
                        Your AI itinerary will include category estimates and a
                        10% spending reserve in your selected currency. No
                        currency conversion or verified prices are provided.
                      </p>
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="form-fields">
                    <fieldset>
                      <legend>What draws you in?</legend>
                      <div className="interest-grid">
                        {interests.map((interest) => (
                          <label
                            className={`interest-chip ${selected.includes(interest) ? "selected" : ""}`}
                            key={interest}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(interest)}
                              onChange={() =>
                                setSelected(
                                  selected.includes(interest)
                                    ? selected.filter(
                                        (item) => item !== interest,
                                      )
                                    : [...selected, interest],
                                )
                              }
                            />
                            {interest}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="field">
                      Any must-sees?
                      <textarea
                        rows={3}
                        maxLength={1000}
                        placeholder="A neighborhood, a favorite dish, a place you’ve always wanted to see…"
                        value={mustSee}
                        onChange={(event) => setMustSee(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      Anything you’d rather skip?
                      <input
                        maxLength={1000}
                        placeholder="Optional"
                        value={avoids}
                        onChange={(event) => setAvoids(event.target.value)}
                      />
                    </label>
                    <details className="advanced-fields">
                      <summary>Dietary & accessibility preferences</summary>
                      <label className="field">
                        Dietary preferences
                        <input
                          maxLength={500}
                          value={dietary}
                          onChange={(event) => setDietary(event.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                      <label className="field">
                        Accessibility preferences
                        <input
                          maxLength={500}
                          value={accessibility}
                          onChange={(event) =>
                            setAccessibility(event.target.value)
                          }
                          placeholder="Optional"
                        />
                      </label>
                    </details>
                  </div>
                )}
                <div className="wizard-controls">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={step === 0}
                    onClick={() => navigate(step - 1)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back
                  </button>
                  <button className="button button-primary" type="submit">
                    {step === 3 ? "Review your trip" : "Continue"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </form>
            )}
          </fieldset>
        </section>
        <WizardPreview
          draft={draft}
          budgetLabel={budgetLabel}
          dateLabel={dateLabel}
          status={status}
        />
      </div>
    </>
  );
}
