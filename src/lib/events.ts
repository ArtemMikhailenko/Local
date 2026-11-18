import { distanceMeters, type LatLng } from "./geo";
import type { Place } from "./places/types";

export type RsvpStatus = "going" | "maybe" | "no";
export const RSVP: RsvpStatus[] = ["going", "maybe", "no"];

export function summarize(rsvps: Array<{ name: string; status: RsvpStatus }>) {
  const by = (s: RsvpStatus) => rsvps.filter((r) => r.status === s).map((r) => r.name);
  return { going: by("going"), maybe: by("maybe"), no: by("no") };
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** iCalendar file so the event lands in the phone's calendar (Apple, Google, Outlook all read it). */
export function toIcs(e: { id: string; title: string; place: Place; startsAt: Date; note: string | null; url: string }, durationMin = 120): string {
  const end = new Date(e.startsAt.getTime() + durationMin * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Locali//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@locali`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `LOCATION:${icsEscape([e.place.name, e.place.address].filter(Boolean).join(", "))}`,
    `GEO:${e.place.location.lat};${e.place.location.lng}`,
    `DESCRIPTION:${icsEscape([e.note, e.url].filter(Boolean).join("\n"))}`,
    `URL:${e.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Public events stay on the map from 3 h after start back to two weeks ahead. */
export const PUBLIC_WINDOW = { pastMs: 3 * 60 * 60_000, aheadMs: 14 * 24 * 60 * 60_000 };
export const PUBLIC_RADIUS_M = 6000;

/** Upcoming public events around a point, soonest first. */
export function nearbyEvents<T extends { startsAt: Date; place: { location: LatLng } }>(rows: T[], at: LatLng, now = Date.now(), radius = PUBLIC_RADIUS_M): T[] {
  return rows
    .filter((e) => {
      const t = e.startsAt.getTime();
      return t >= now - PUBLIC_WINDOW.pastMs && t <= now + PUBLIC_WINDOW.aheadMs && distanceMeters(at, e.place.location) <= radius;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
