"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
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

  if (
    photo.target.id !== featured.id ||
    photo.target.photo.image !== featured.photo.image
  ) {
    const samePhoto =
      photo.visible.photo.image === featured.photo.image ||
      failedPhoto === featured.photo.image;
    setPhoto({
      target: featured,
      previous: samePhoto ? null : photo.visible,
      visible: samePhoto ? featured : photo.visible,
    });
  }

  const entering = photo.previous && photo.visible.id === featured.id;
  useEffect(() => {
    if (!entering) return;
    let live = true;
    const animations = activeLayer.current?.getAnimations() ?? [];
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (live) setPhoto((current) => ({ ...current, previous: null }));
    });
    return () => {
      live = false;
    };
  }, [entering]);

  const photos =
    photo.previous && photo.previous.id !== featured.id
      ? [photo.previous, featured]
      : [featured];
  const photoLabel = featured.inspirationPhoto
    ? "Travel inspiration"
    : undefined;
  return (
    <section className="dashboard-destination" aria-label="Featured trip">
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
                  sizes="(max-width: 700px) 100vw, 85vw"
                  loading="eager"
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
      {trips.length > 1 && (
        <nav
          className="dashboard-trip-switcher"
          aria-label="Choose a featured trip"
        >
          {trips.map((trip) => (
            <Link
              key={trip.id}
              href={{ pathname: "/dashboard", query: { trip: trip.id } }}
              prefetch={false}
              replace
              scroll={false}
              aria-current={trip.id === featured.id ? "true" : undefined}
              aria-label={`Feature ${trip.name}${trip.dates ? `, ${trip.dates}` : ""}`}
            >
              <Image src={trip.photo.image} alt="" fill sizes="120px" />
              <span>{trip.name}</span>
              <ThumbnailProgress />
            </Link>
          ))}
        </nav>
      )}
      <div className="dashboard-destination-content">
        <div
          className="dashboard-destination-copy"
          key={featured.id}
          aria-live="polite"
        >
          {featured.status && (
            <p className="dashboard-trip-status">{featured.status}</p>
          )}
          <h2>
            {featured.name}
            {featured.country && <span>{featured.country}</span>}
          </h2>
          {featured.dates && (
            <p className="dashboard-destination-date">{featured.dates}</p>
          )}
          {featured.details && <p>{featured.details}</p>}
          {featured.description && (
            <p className="dashboard-destination-description">
              {featured.description}
            </p>
          )}
        </div>
        <div className="dashboard-destination-action">
          <Link href={featured.action.href}>
            {featured.action.label}{" "}
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          {photoLabel && <small>{photoLabel}</small>}
        </div>
      </div>
    </section>
  );
}
