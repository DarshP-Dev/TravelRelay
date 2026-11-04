"use client";

import { useRef, useState } from "react";
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

const steps = ["Destination", "Trip details", "Budget", "Preferences"];

export function TripWizard({ template }: { template?: CuratedTrip }) {
  const [step, setStep] = useState(0);
  const [review, setReview] = useState(false);
  const [mode, setMode] = useState("known");
  const [destination, setDestination] = useState(template?.city ?? "");
  const [vibe, setVibe] = useState("");
  const [departure, setDeparture] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dateError, setDateError] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [month, setMonth] = useState("");
  const [duration, setDuration] = useState(template?.days ?? 7);
  const [travelers, setTravelers] = useState(1);
  const [pace, setPace] = useState("balanced");
  const [budget, setBudget] = useState(
    template ? String(template.estimate) : "",
  );
  const [currency, setCurrency] = useState(template ? "USD" : "CAD");
  const [scope, setScope] = useState(template ? "spending" : "entire");
  const [style, setStyle] = useState("balanced");
  const [selected, setSelected] = useState<string[]>(template?.interests ?? []);
  const [mustSee, setMustSee] = useState("");
  const [avoids, setAvoids] = useState("");
  const [dietary, setDietary] = useState("");
  const [accessibility, setAccessibility] = useState("");
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
      <div className="notice">
        <strong>Planning form preview</strong>
        <p>
          Saving and AI generation aren’t connected. Your inputs stay in this
          open form and are cleared on refresh or when you leave this page.
          Please use sample details.
        </p>
      </div>
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
                ? "Review your sample trip intent. Nothing has been saved or generated."
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
                    {mode === "known" ? destination : `Help me decide: ${vibe}`}
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
                convert currencies, or validate a trip’s cost. Country and vibe
                matching will require a confirmed single base city before future
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
                <button className="button button-primary" disabled>
                  Save & generate — coming later
                </button>
              </div>
              <ButtonLink href="/trips/preview" variant="text">
                Look around the empty workspace{" "}
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
                            onChange={() => setMode(choice.value)}
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
                        onChange={(event) => setDestination(event.target.value)}
                        placeholder="e.g. Kyoto, Japan"
                        required
                        maxLength={120}
                      />
                      <span>
                        We’ll plan around one base city. Country or region
                        choices will need city confirmation once generation is
                        connected.
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
                        Destination suggestions aren’t connected in this
                        preview.
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
                          max={60}
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
                  <label className="field">
                    Your pace
                    <select
                      value={pace}
                      onChange={(event) => setPace(event.target.value)}
                    >
                      <option value="relaxed">Relaxed — time to linger</option>
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
                        onChange={(event) => setCurrency(event.target.value)}
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
                    Use your total for all travelers. Selecting a currency only
                    changes the denomination; it does not convert the amount.
                    Template defaults assume one traveler.
                  </p>
                  <label className="field">
                    What does this budget cover?
                    <select
                      value={scope}
                      onChange={(event) => setScope(event.target.value)}
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
                      onChange={(event) => setStyle(event.target.value)}
                    >
                      <option value="budget-friendly">Budget-friendly</option>
                      <option value="balanced">Balanced</option>
                      <option value="premium">Premium</option>
                    </select>
                  </label>
                  <div className="notice compact">
                    <strong>A little breathing room matters.</strong>
                    <p>
                      Category allocations, a protected reserve, and destination
                      currency estimates will follow when the budget service is
                      implemented.
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
                                  ? selected.filter((item) => item !== interest)
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
                        placeholder="Optional sample preference"
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
                        placeholder="Optional sample preference"
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
        </section>
        <aside className="wizard-aside">
          <span className="empty-icon">
            <Compass size={27} aria-hidden="true" />
          </span>
          <h3>
            A plan with
            <br />a little more you.
          </h3>
          <p>
            Big adventures start with small details. Take your time — this is
            your trip.
          </p>
          <dl>
            <div>
              <dt>Your starting point</dt>
              <dd>
                {mode === "known"
                  ? destination || "Anywhere you’re dreaming of"
                  : vibe || "A feeling, for now"}
              </dd>
            </div>
            <div>
              <dt>Travelers</dt>
              <dd>
                {travelers} {travelers === 1 ? "traveler" : "travelers"}
              </dd>
            </div>
            <div>
              <dt>Planning budget</dt>
              <dd>{budgetLabel}</dd>
            </div>
          </dl>
          {template && (
            <p className="template-note">
              Inspired by “{template.title}”. Defaults are editable editorial
              estimates.
            </p>
          )}
          <span className="aside-footnote">
            Form preview · Nothing saved yet
          </span>
        </aside>
      </div>
    </>
  );
}
