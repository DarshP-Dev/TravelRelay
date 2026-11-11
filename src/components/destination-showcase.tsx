"use client";

import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { CuratedTrip } from "@/lib/curated-trips";
import "./destination-showcase.css";

const destinationNames: Record<string, string> = {
  "cinque-terre": "Cinque Terre",
  santorini: "Santorini",
  dolomites: "The Dolomites",
};

const sceneSizes = "(max-width: 700px) max(100vw, 85svh), 100vw";

function destinationName(trip: CuratedTrip) {
  return destinationNames[trip.id] ?? trip.city;
}

type Selection = {
  active: CuratedTrip;
  outgoing: CuratedTrip | null;
  pending: { trip: CuratedTrip; ready: boolean } | null;
};

function showReadyDestination(selection: Selection): Selection {
  if (selection.outgoing || !selection.pending?.ready) return selection;
  return {
    active: selection.pending.trip,
    outgoing: selection.active,
    pending: null,
  };
}

function DestinationPhoto({
  trip,
  onReady,
  eager,
}: {
  trip: CuratedTrip;
  onReady: () => void;
  eager: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="destination-photo-fallback" />;

  return (
    <Image
      className="destination-image"
      src={trip.image}
      alt=""
      fill
      sizes={sceneSizes}
      loading={eager ? "eager" : "lazy"}
      onLoad={onReady}
      onError={() => {
        setFailed(true);
        onReady();
      }}
    />
  );
}

function DestinationCopy({
  trip,
  heading: Heading,
}: {
  trip: CuratedTrip;
  heading: "h1" | "h2" | "span";
}) {
  return (
    <>
      <p className="destination-category">
        {trip.country} <span aria-hidden="true">/</span> {trip.style}
      </p>
      <Heading className="destination-title">{destinationName(trip)}</Heading>
      <div className="destination-description">
        <p className="destination-trip-title">{trip.title}</p>
        <p>{trip.description}</p>
      </div>
      <p className="destination-details">
        <span>{trip.days} days</span>
        <span>${trip.estimate.toLocaleString("en-US")} USD / person est.</span>
      </p>
    </>
  );
}

export function DestinationShowcase({
  trips,
  id,
  initialId,
  home = false,
}: {
  trips: readonly CuratedTrip[];
  id: string;
  initialId?: string;
  home?: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(() => ({
    active: trips.find((trip) => trip.id === initialId) ?? trips[0],
    outgoing: null,
    pending: null,
  }));
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const activePhoto = useRef<HTMLDivElement>(null);
  const { active, outgoing, pending } = selection;

  useEffect(() => {
    if (!outgoing) return;

    // Keep the outgoing scene in place until the incoming photo is opaque.
    // New selections can load in parallel, but only the latest can take over.
    let cancelled = false;
    const animations = activePhoto.current?.getAnimations() ?? [];
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (!cancelled) {
        setSelection((current) =>
          showReadyDestination({ ...current, outgoing: null }),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active.id, outgoing]);

  useEffect(() => {
    if (!photoLoaded || outgoing) return;
    const next = trips[trips.findIndex((trip) => trip.id === active.id) + 1];
    if (!next) return;

    const { props } = getImageProps({
      src: next.image,
      alt: "",
      fill: true,
      sizes: sceneSizes,
    });
    const preload = new window.Image();
    preload.fetchPriority = "low";
    preload.sizes = props.sizes ?? "100vw";
    preload.srcset = props.srcSet ?? "";
    preload.src = props.src;
  }, [active, outgoing, photoLoaded, trips]);

  function selectTrip(trip: CuratedTrip) {
    setSelection((current) => {
      if (trip.id === current.active.id) return { ...current, pending: null };

      return showReadyDestination({
        ...current,
        pending: { trip, ready: trip.id === current.outgoing?.id },
      });
    });
  }

  function photoReady(trip: CuratedTrip) {
    setPhotoLoaded(true);
    setSelection((current) => {
      if (current.pending?.trip.id !== trip.id) return current;
      return showReadyDestination({
        ...current,
        pending: { trip, ready: true },
      });
    });
  }

  const photos = [outgoing, active];
  if (pending && pending.trip.id !== outgoing?.id) photos.push(pending.trip);

  return (
    <section
      className="destination-showcase"
      id={id}
      aria-label="Curated journeys"
    >
      <div className="destination-media" aria-hidden="true">
        {photos.map((trip) => {
          if (!trip) return null;
          const role =
            trip.id === active.id
              ? "active"
              : trip.id === outgoing?.id
                ? "outgoing"
                : "pending";

          return (
            <div
              key={trip.id}
              className="destination-photo"
              data-destination={trip.id}
              data-scene={role}
              data-entering={role === "active" && !!outgoing}
              ref={role === "active" ? activePhoto : undefined}
            >
              <DestinationPhoto
                trip={trip}
                eager={!home || role === "pending"}
                onReady={() => photoReady(trip)}
              />
            </div>
          );
        })}
      </div>

      <div className="destination-layout">
        <div className="destination-section-label">
          {home ? (
            <Link href="/explore">
              Curated journeys <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          ) : (
            <p>Curated journeys</p>
          )}
        </div>

        <div className="destination-body">
          <div className="destination-stage" id={`${id}-feature`}>
            <div className="destination-copy-stack">
              {outgoing && (
                <div
                  key={outgoing.id}
                  className="destination-copy"
                  data-destination={outgoing.id}
                  data-scene="outgoing"
                  aria-hidden="true"
                >
                  <DestinationCopy trip={outgoing} heading="span" />
                </div>
              )}
              <div
                key={active.id}
                className="destination-copy"
                data-destination={active.id}
                data-scene="active"
                data-entering={!!outgoing}
              >
                <DestinationCopy trip={active} heading={home ? "h2" : "h1"} />
              </div>
            </div>
            <Link
              className="destination-link"
              href={`/explore/${active.id}`}
              aria-label={`Explore this trip: ${destinationName(active)}`}
            >
              Explore this trip <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <fieldset className="destination-selector">
            <legend>Choose a destination</legend>
            <div className="destination-options">
              {trips.map((trip) => (
                <label
                  className="destination-option"
                  key={trip.id}
                  data-destination={trip.id}
                  data-active={active.id === trip.id}
                  data-pending={pending?.trip.id === trip.id}
                >
                  <input
                    type="radio"
                    name={`${id}-destination`}
                    value={trip.id}
                    checked={(pending?.trip.id ?? active.id) === trip.id}
                    aria-controls={`${id}-feature`}
                    onChange={() => selectTrip(trip)}
                  />
                  <Image
                    src={trip.image}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 160px, 240px"
                    className="destination-image"
                    aria-hidden="true"
                  />
                  <span>{destinationName(trip)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <p className="sr-only" role="status">
          {pending
            ? `Loading ${destinationName(pending.trip)}`
            : `${destinationName(active)} is featured`}
        </p>
        <p className="destination-estimate-note">
          Estimated spending per person. Flights and accommodation excluded.
          Prices and availability are unverified.
        </p>
        <noscript>
          <ul className="destination-fallback-links">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link href={`/explore/${trip.id}`}>
                  {destinationName(trip)}
                </Link>
              </li>
            ))}
          </ul>
        </noscript>
      </div>
    </section>
  );
}
