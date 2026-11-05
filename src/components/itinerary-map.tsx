"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Itinerary } from "@/lib/itinerary";
import { hasCoordinates } from "@/lib/itinerary-editing";

export default function ItineraryMap({
  day,
  onSelect,
}: {
  day: Itinerary["days"][number];
  onSelect: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    callback = useRef(onSelect);
  useEffect(() => {
    callback.current = onSelect;
  }, [onSelect]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false,
      map: import("leaflet").Map | undefined;
    void import("leaflet")
      .then((L) => {
        if (disposed || !element.current) return;
        map = L.map(element.current, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
          .on("tileerror", () => setFailed(true))
          .addTo(map);
        const coordinates: [number, number][] = [];
        day.activities.forEach((a, index) => {
          if (!hasCoordinates(a)) return;
          coordinates.push([a.latitude, a.longitude]);
          const label = document.createElement("span");
          label.textContent = `${index + 1}. ${a.title} · Unverified coordinates`;
          L.circleMarker([a.latitude, a.longitude], {
            radius: 11,
            color: "#197c72",
            fillOpacity: 0.85,
          })
            .bindTooltip(label)
            .on("click", () => callback.current(a.id))
            .addTo(map!);
        });
        if (coordinates.length)
          map.fitBounds(L.latLngBounds(coordinates), {
            padding: [35, 35],
            maxZoom: 15,
          });
        else {
          map.remove();
          map = undefined;
        }
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [day]);
  const points = day.activities.filter(hasCoordinates);
  return (
    <section className="activity-map-section" aria-label="Activity locations">
      <p>
        Stored coordinates are AI estimates or user-entered points, not verified
        locations. Select a marker or a location below to highlight its card. No
        route, distance or journey time is supplied.
      </p>
      {points.length ? (
        <div
          ref={element}
          className="activity-map"
          aria-label="Map of selected day activity locations"
        />
      ) : (
        <p className="notice">
          No coordinates are available for this day. Add known coordinates using
          Edit; locations are never geocoded or invented.
        </p>
      )}
      {failed && (
        <p role="status">
          Map tiles are unavailable. Your locations and activity controls remain
          available below.
        </p>
      )}
      <ul className="map-location-list">
        {day.activities.map((a, i) => (
          <li key={a.id}>
            <button type="button" onClick={() => callback.current(a.id)}>
              {i + 1}. {a.title}
            </button>
            <small>
              {a.location} ·{" "}
              {hasCoordinates(a)
                ? "Unverified coordinates"
                : "Coordinates not supplied"}
            </small>
          </li>
        ))}
      </ul>
      <p className="inline-note">
        Leaflet / OpenStreetMap · map tiles load only in this view.{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noopener noreferrer"
        >
          Report a map issue
        </a>
        .
      </p>
    </section>
  );
}
