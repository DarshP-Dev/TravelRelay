"use client";
import { useEffect, useRef, useState } from "react";
import type { Scheduler } from "@bryntum/scheduler-community";
import "@bryntum/scheduler-community/scheduler.css";
import "@bryntum/scheduler-community/stockholm-light.css";
import "@bryntum/core-community/fontawesome/css/fontawesome.css";
import "@bryntum/core-community/fontawesome/css/solid.css";
import {
  schedulerData,
  schedulerChange,
  scheduleClock,
  escapeScheduleText,
} from "@/lib/schedule-adapter";
import type { Itinerary } from "@/lib/itinerary";
import { clock } from "@/lib/activity-metadata";

export default function VisualSchedule({
  plan,
  onChange,
  onSelect,
  disabled,
}: {
  plan: Itinerary;
  onChange: (change: ReturnType<typeof schedulerChange>) => void;
  onSelect: (activityId: string, focus?: boolean) => void;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<Scheduler | null>(null);
  const callback = useRef(onChange);
  const select = useRef(onSelect);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      scheduler: Scheduler | undefined;
    void import("@bryntum/scheduler-community")
      .then(({ Scheduler }) => {
        if (disposed || !host.current) return;
        const rows = schedulerData(plan);
        scheduler = new Scheduler({
          appendTo: host.current,
          cls: "travel-scheduler",
          height: Math.min(500, 62 + rows.resources.length * 74),
          rowHeight: 74,
          barMargin: 9,
          startDate: scheduleClock(0),
          endDate: scheduleClock(1440),
          displayDateFormat: "HH:mm",
          visibleDate: { date: scheduleClock(540), block: "start" },
          viewPreset: {
            base: "hourAndDay",
            tickWidth: 78,
            headers: [{ unit: "hour", dateFormat: "HH:mm" }],
            timeResolution: { unit: "minute", increment: 15 },
          },
          columns: [
            {
              text: "Trip day",
              field: "name",
              width: Math.min(
                185,
                Math.max(100, host.current.clientWidth * 0.25),
              ),
              htmlEncode: true,
            },
          ],
          ...rows,
          readOnly: disabled,
          allowOverlap: true,
          snap: true,
          features: {
            eventEdit: false,
            eventMenu: false,
            scheduleMenu: false,
            eventDragCreate: false,
            eventTooltip: {
              template: ({ eventRecord }) =>
                escapeScheduleText(String(eventRecord.name)),
            },
            cellEdit: false,
          },
          eventRenderer: ({ eventRecord, renderData }) => {
            const day = plan.days.find((d) =>
              d.activities.some((a) => a.id === String(eventRecord.id)),
            );
            const activity = day?.activities.find(
              (a) => a.id === String(eventRecord.id),
            );
            const title = escapeScheduleText(String(eventRecord.name));
            if (day && activity) {
              renderData.ariaLabel = `${activity.title}, ${day.date}, ${clock(activity.startMinute)} to ${clock(activity.startMinute + activity.durationMinutes)}, ${activity.durationMinutes} minutes. Drag or use the Edit controls below.`;
              return `<div class="schedule-event-copy"><span class="schedule-event-name">${title}</span><small class="schedule-event-time">${clock(activity.startMinute)}–${clock(activity.startMinute + activity.durationMinutes)}</small></div>`;
            }
            return title;
          },
          listeners: {
            eventClick({ eventRecord }) {
              select.current(String(eventRecord.id), false);
            },
            beforeEventDropFinalize({ context }) {
              context.async = true;
              try {
                const change = schedulerChange(
                  plan,
                  String(context.eventRecord.id),
                  String((context.newResource ?? context.resourceRecord).id),
                  context.startDate,
                  context.endDate,
                );
                void context.finalize(false);
                callback.current(change);
              } catch (cause) {
                void context.finalize(false);
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Review this schedule change.",
                );
              }
            },
            async beforeEventResizeFinalize(event) {
              event.async = true;
              const day = plan.days.find((d) =>
                d.activities.some((a) => a.id === String(event.eventRecord.id)),
              );
              try {
                const change = schedulerChange(
                  plan,
                  String(event.eventRecord.id),
                  day!.id,
                  event.startDate,
                  event.endDate,
                );
                await event.finalize(false);
                callback.current(change);
              } catch (cause) {
                await event.finalize(false);
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Review this duration change.",
                );
              }
            },
          },
        });
        instance.current = scheduler;
      })
      .catch(() =>
        setError(
          "The visual scheduler could not load. All activities can still be edited using the chronological cards below.",
        ),
      );
    return () => {
      disposed = true;
      scheduler?.destroy();
      instance.current = null;
    };
  }, [plan, disabled]);
  return (
    <section className="visual-schedule" aria-label="Visual trip schedule">
      <div className="visual-schedule-toolbar">
        <p>
          Drag or resize to preview a change. Use the cards for keyboard and
          touch editing.
        </p>
        <div className="editor-actions" aria-label="Schedule zoom">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              const s = instance.current;
              if (s) s.tickSize = Math.min(180, s.tickSize * 1.3);
            }}
          >
            Zoom in
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              const s = instance.current;
              if (s) s.tickSize = Math.max(24, s.tickSize / 1.3);
            }}
          >
            Zoom out
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div ref={host} className="scheduler-host" />
      <p className="inline-note">Bryntum Scheduler Community · MIT</p>
    </section>
  );
}
