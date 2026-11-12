"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
  Sparkles,
  Wallet,
} from "lucide-react";
import { clock, type ActivityCategory } from "@/lib/activity-metadata";
import { money, type Itinerary, type SavedActivity } from "@/lib/itinerary";
import type { ScheduleReference } from "@/lib/itinerary-editing";
import { destinationPhoto } from "@/lib/trip-intent";
import { dashboardDate } from "@/lib/dashboard-trips";
import { ActivityDiscovery } from "./activity-insights";
import { DestinationImage } from "./destination-image";
import type { ReactNode } from "react";

const categoryInterest: Partial<Record<ActivityCategory, string>> = {
  culture: "Culture",
  food: "Food",
  outdoors: "Outdoors",
  shopping: "Shopping",
  relaxation: "Relaxation",
  entertainment: "Entertainment",
};

function timeRange(activity: SavedActivity) {
  return `${clock(activity.startMinute)}–${clock(activity.startMinute + activity.durationMinutes)}`;
}

export function ActivityDetails({
  activity,
  day,
  dayNumber,
  plan,
  category,
  interests,
  reference,
  tripId,
  version,
  showReviews,
  editable,
  onEdit,
  onSelect,
  onMap,
  onClose,
  children,
}: {
  activity: SavedActivity;
  day: Itinerary["days"][number];
  dayNumber: number;
  plan: Itinerary;
  category: ActivityCategory;
  interests: readonly string[];
  reference?: ScheduleReference;
  tripId: string;
  version: number;
  showReviews: boolean;
  editable: boolean;
  onEdit: () => void;
  onSelect: (activityId: string) => void;
  onMap: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const photo = destinationPhoto(plan.base.city);
  const destinationPhotoAvailable =
    photo && photo.country.toLowerCase() === plan.base.country.toLowerCase();
  const interest = categoryInterest[category];
  const matchesInterest = interest && interests.includes(interest);
  const coordinates = activity.latitude !== null && activity.longitude !== null;
  const titleId = `activity-detail-title-${activity.id}`;
  return (
    <section
      className="activity-detail"
      id={`activity-detail-${activity.id}`}
      aria-labelledby={titleId}
    >
      <header
        className="activity-detail-hero"
        data-has-photo={!!destinationPhotoAvailable}
      >
        {destinationPhotoAvailable && (
          <DestinationImage
            src={photo.image}
            alt={photo.alt}
            sizes="(max-width: 760px) 95vw, 58vw"
          />
        )}
        <div>
          <span className="workspace-pill" data-category={category}>
            {category}
          </span>
          <h4 id={titleId} tabIndex={-1}>
            {activity.title}
          </h4>
          <p>
            <MapPin size={17} aria-hidden="true" /> {activity.location} ·{" "}
            {plan.base.city}
          </p>
        </div>
        {destinationPhotoAvailable && (
          <small>{plan.base.city} destination photo</small>
        )}
      </header>
      <dl className="activity-detail-facts">
        <div>
          <dt>
            <CalendarDays size={17} aria-hidden="true" /> Date
          </dt>
          <dd>
            <time dateTime={day.date}>{dashboardDate(day.date)}</time>
          </dd>
        </div>
        <div>
          <dt>
            <Clock3 size={17} aria-hidden="true" /> Local time
          </dt>
          <dd>
            {timeRange(activity)} · {activity.durationMinutes} min
          </dd>
        </div>
        <div>
          <dt>
            <Wallet size={17} aria-hidden="true" /> Group estimate
          </dt>
          <dd>
            {money(activity.costMinor, plan.currency)} {plan.currency}
          </dd>
        </div>
        <div>
          <dt>
            <MapPin size={17} aria-hidden="true" /> Travel buffer
          </dt>
          <dd>{activity.bufferBeforeMinutes} min before activity</dd>
        </div>
      </dl>
      <div className="activity-detail-layout">
        <div className="activity-detail-content">
          <p className="activity-detail-description">{activity.description}</p>
          <div className="activity-detail-panels">
            <div>
              <ActivityDiscovery
                activity={activity}
                base={plan.base}
                category={category}
                tripId={tripId}
                version={version}
                showReviews={showReviews}
              />
            </div>
            <div>
              {matchesInterest && (
                <section className="activity-detail-card">
                  <h5>
                    <Sparkles size={17} aria-hidden="true" /> Why this fits your
                    trip
                  </h5>
                  <p>
                    You selected <strong>{interest}</strong> as an interest, and
                    this activity is categorized as {category}.
                  </p>
                </section>
              )}
              <section className="activity-detail-card">
                <h5>
                  <MapPin size={17} aria-hidden="true" /> Location &amp;
                  information
                </h5>
                <p>
                  {activity.location} · {plan.base.city}, {plan.base.country}
                </p>
                <p className="inline-note">
                  {activity.estimateSource === "manual-estimate"
                    ? "User-entered estimate"
                    : "AI estimate"}{" "}
                  included in its category allocation.
                </p>
                {reference ? (
                  <div className="venue-evidence">
                    <strong>
                      Published hours reference · {reference.name}
                    </strong>
                    {reference.openMinute !== undefined &&
                      reference.closeMinute !== undefined &&
                      reference.lastAdmissionMinute !== undefined && (
                        <small>
                          {clock(reference.openMinute)}–
                          {clock(reference.closeMinute)} · Last admission{" "}
                          {clock(reference.lastAdmissionMinute)}
                        </small>
                      )}
                    <a
                      href={reference.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Official venue information
                    </a>
                    <small>
                      Source checked {reference.checkedOn}. Confirm future hours
                      and availability directly.
                    </small>
                  </div>
                ) : (
                  <p className="inline-note">
                    Venue hours and availability require confirmation.
                  </p>
                )}
                {coordinates && (
                  <>
                    <p className="inline-note">
                      {activity.coordinateSource === "user-entered"
                        ? "User-entered"
                        : "AI-estimated"}{" "}
                      coordinates · unverified
                    </p>
                    <button type="button" className="text-link" onClick={onMap}>
                      Show on itinerary map
                    </button>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
        <aside
          className="activity-day-context"
          aria-label="Your schedule for this day"
        >
          <h5>
            <CalendarDays size={17} aria-hidden="true" /> Day {dayNumber} · Your
            schedule
          </h5>
          <p>
            {dashboardDate(day.date)} · {plan.base.timeZone}
          </p>
          <ol>
            {day.activities.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === activity.id ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>{timeRange(item)}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <div className="activity-detail-actions editor-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={!editable}
          onClick={onEdit}
        >
          <Pencil size={16} aria-hidden="true" /> Edit activity
        </button>
        {editable && (
          <Link
            className="button button-secondary"
            href={`/trips/${tripId}/itinerary?activity=${activity.id}#activity-${activity.id}`}
            prefetch={false}
          >
            <Sparkles size={17} aria-hidden="true" /> Ask about alternatives
          </Link>
        )}
        {children}
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to activity list
        </button>
      </div>
    </section>
  );
}
