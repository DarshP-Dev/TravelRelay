"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { ArrowRight, CalendarDays, ChevronRight } from "lucide-react";
import type { DashboardHeroTrip } from "@/lib/dashboard-trips";

function ThumbnailProgress() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="dashboard-thumb-progress" role="status">
      Loading trip
    </span>
  ) : null;
}

export function DashboardTripHero({
  featured,
  trips,
}: {
  featured: DashboardHeroTrip;
  trips: readonly DashboardHeroTrip[];
}) {
  const [photo, setPhoto] = useState({
    target: featured,
    previous: null as DashboardHeroTrip | null,
    visible: featured,
  });
  const [failedPhoto, setFailedPhoto] = useState("");
  const activeLayer = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const keyboardTarget = useRef<string | null>(null);

  if (
    photo.target.id !== featured.id ||
    photo.target.photo.image !== featured.photo.image
  ) {
    const samePhoto =
      photo.visible.photo.image === featured.photo.image ||
      photo.previous?.photo.image === featured.photo.image ||
      failedPhoto === featured.photo.image;
    setPhoto({
      target: featured,
      previous: samePhoto ? null : photo.visible,
      visible: samePhoto ? featured : photo.visible,
    });
  }

  const entering = photo.previous && photo.visible.id === featured.id;
  useEffect(() => {
    if (keyboardTarget.current === featured.id) {
      keyboardTarget.current = null;
      title.current?.focus({ preventScroll: true });
    }
  }, [featured.id]);
  useEffect(() => {
    if (!entering) return;
    let live = true;
    const animations = activeLayer.current?.getAnimations() ?? [];
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (live)
        setPhoto((current) =>
          current.target.id === featured.id
            ? { ...current, previous: null }
            : current,
        );
    });
    return () => {
      live = false;
    };
  }, [entering, featured.id]);

  const photos =
    photo.previous && photo.previous.id !== featured.id
      ? [photo.previous, featured]
      : [featured];
  const photoLabel = featured.inspirationPhoto
    ? "Travel inspiration"
    : undefined;
  const otherTrips = trips.filter((trip) => trip.id !== featured.id);
  return (
    <section
      className="dashboard-feature"
      aria-label="Featured trip"
      data-has-alternatives={otherTrips.length > 0}
    >
      <div className="dashboard-destination">
        <div className="dashboard-destination-media" aria-hidden="true">
          {photos.map((trip) => {
            const isActive = trip.id === featured.id;
            const waiting = isActive && photo.visible.id !== featured.id;
            return (
              <div
                key={trip.id}
                className="dashboard-destination-layer"
                data-waiting={waiting}
                data-entering={!!(isActive && entering)}
                ref={isActive ? activeLayer : undefined}
              >
                {failedPhoto !== trip.photo.image && (
                  <Image
                    src={trip.photo.image}
                    alt=""
                    fill
                    sizes="(max-width: 760px) 100vw, 65vw"
                    loading="eager"
                    fetchPriority={photos.length === 1 ? "high" : "auto"}
                    onLoad={() => {
                      if (isActive)
                        setPhoto((current) =>
                          current.target.id === trip.id
                            ? { ...current, visible: trip }
                            : current,
                        );
                    }}
                    onError={() => {
                      if (!isActive) return;
                      setFailedPhoto(trip.photo.image);
                      setPhoto((current) =>
                        current.target.id === trip.id
                          ? { ...current, visible: trip }
                          : current,
                      );
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="dashboard-destination-content">
          <div
            className="dashboard-destination-copy"
            key={featured.id}
            aria-live="polite"
          >
            {featured.status && (
              <p className="dashboard-trip-status">
                <CalendarDays size={15} aria-hidden="true" /> {featured.status}
              </p>
            )}
            <h2 ref={title} tabIndex={-1}>
              {featured.name}
              {featured.country && <span>, {featured.country}</span>}
            </h2>
            {(featured.dates || featured.details) && (
              <p className="dashboard-destination-date">
                {featured.dates && <span>{featured.dates}</span>}
                {featured.details && <span>{featured.details}</span>}
              </p>
            )}
            {featured.description && (
              <p className="dashboard-destination-description">
                {featured.description}
              </p>
            )}
          </div>
          <div className="dashboard-destination-action">
            <Link href={featured.action.href}>
              {featured.action.label}{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            {photoLabel && <small>{photoLabel}</small>}
          </div>
        </div>
      </div>
      {otherTrips.length > 0 && (
        <nav
          className="dashboard-trip-switcher"
          aria-label="Choose a featured trip"
        >
          {otherTrips.map((trip) => (
            <Link
              key={trip.id}
              href={{ pathname: "/dashboard", query: { trip: trip.id } }}
              prefetch={false}
              replace
              scroll={false}
              onClick={(event) => {
                keyboardTarget.current = event.detail === 0 ? trip.id : null;
              }}
              aria-label={`Feature ${trip.name}${trip.dates ? `, ${trip.dates}` : ""}`}
            >
              <Image src={trip.photo.image} alt="" fill sizes="360px" />
              <div>
                <strong>
                  {trip.name}
                  {trip.country ? `, ${trip.country}` : ""}
                </strong>
                {trip.dates && <small>{trip.dates}</small>}
                {trip.inspirationPhoto && <small>Travel inspiration</small>}
              </div>
              <ChevronRight size={19} aria-hidden="true" />
              <ThumbnailProgress />
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}
