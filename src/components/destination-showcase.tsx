"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Mountain } from "lucide-react";
import type { CuratedTrip } from "@/lib/curated-trips";

const destinationNames: Record<string, string> = {
  "cinque-terre": "Cinque Terre",
  santorini: "Santorini",
  dolomites: "The Dolomites",
};

function destinationName(trip: CuratedTrip) {
  return destinationNames[trip.id] ?? trip.city;
}

function DestinationPhoto({
  trip,
  isReady,
  isSelected,
  onReady,
}: {
  trip: CuratedTrip;
  isReady: boolean;
  isSelected: boolean;
  onReady?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`destination-stage-photo${isReady ? " is-ready" : ""}`}
      aria-hidden={!isSelected}
    >
      {failed ? (
        <div className="destination-stage-fallback">
          <Mountain size={36} strokeWidth={1.25} aria-hidden="true" />
          <span>Photo unavailable</span>
        </div>
      ) : (
        <Image
          className="destination-image"
          src={trip.image}
          alt={trip.alt}
          fill
          sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1344px) 58vw, 750px"
          onLoad={onReady}
          onError={() => {
            setFailed(true);
            onReady?.();
          }}
        />
      )}
    </div>
  );
}

export function DestinationShowcase({
  trips,
  id,
  heading: Heading = "h2",
}: {
  trips: readonly CuratedTrip[];
  id: string;
  heading?: "h2" | "h3";
}) {
  const [{ selected, visible, backdrop }, setSelection] = useState<{
    selected: CuratedTrip;
    visible: CuratedTrip;
    backdrop: CuratedTrip | null;
  }>({ selected: trips[0], visible: trips[0], backdrop: null });
  // Keep the last loaded image underneath the new image until the fade completes.
  const photos =
    backdrop && backdrop.id !== selected.id ? [backdrop, selected] : [selected];

  return (
    <div className="destination-showcase">
      <div className="destination-stage" id={`${id}-feature`}>
        <div className="destination-stage-media">
          {photos.map((trip) => (
            <DestinationPhoto
              key={trip.id}
              trip={trip}
              isReady={trip.id === visible.id || trip.id === backdrop?.id}
              isSelected={trip.id === selected.id}
              onReady={
                trip.id !== visible.id && trip.id === selected.id
                  ? () =>
                      setSelection((current) =>
                        current.selected.id === trip.id
                          ? { ...current, visible: trip }
                          : current,
                      )
                  : undefined
              }
            />
          ))}
        </div>
        <div className="destination-stage-content" key={selected.id}>
          <p className="eyebrow cinematic-reveal">
            {selected.country} <span aria-hidden="true">/</span>{" "}
            {selected.style}
          </p>
          <Heading className="destination-stage-title cinematic-reveal">
            {destinationName(selected)}
          </Heading>
          <p className="destination-stage-description cinematic-reveal">
            {selected.description}
          </p>
          <p className="destination-stage-interests cinematic-reveal">
            {selected.interests.join(" · ")}
          </p>
          <div className="destination-stage-details cinematic-reveal">
            <span>{selected.days} days</span>
            <span>
              ${selected.estimate.toLocaleString("en-US")} USD / person est.
            </span>
          </div>
          <Link
            className="editorial-button destination-stage-link cinematic-reveal"
            href={`/explore/${selected.id}`}
          >
            Explore {destinationName(selected)}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <fieldset className="destination-selector">
        <legend className="sr-only">Choose a destination</legend>
        <div className="destination-options">
          {trips.map((trip) => (
            <label className="destination-option" key={trip.id}>
              <input
                type="radio"
                name={`${id}-destination`}
                value={trip.id}
                checked={selected.id === trip.id}
                aria-controls={`${id}-feature`}
                onChange={() =>
                  setSelection((current) => ({
                    ...current,
                    selected: trip,
                    backdrop: current.visible,
                  }))
                }
              />
              <span className="destination-thumb" aria-hidden="true">
                <Image
                  src={trip.image}
                  alt=""
                  fill
                  sizes="120px"
                  className="destination-image"
                />
              </span>
              <span className="destination-option-title">
                {destinationName(trip)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <noscript>
        <ul className="destination-fallback-links">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link href={`/explore/${trip.id}`}>{destinationName(trip)}</Link>
            </li>
          ))}
        </ul>
      </noscript>
      <p className="destination-estimate-note">
        Curated trip ideas. Per-person USD estimates exclude flights and
        accommodation. Prices and availability are unverified.
      </p>
    </div>
  );
}
