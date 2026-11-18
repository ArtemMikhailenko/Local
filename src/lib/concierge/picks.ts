import { z } from "zod";

export const PickSchema = z.object({
  place_id: z.string().min(1),
  headline: z.string().min(1).max(80),
  why: z.string().min(1).max(400),
  tip: z.string().max(200).optional().default(""),
});

export const PicksSchema = z.object({
  intro: z.string().max(400),
  picks: z.array(PickSchema).min(1).max(3),
});

export type Picks = z.infer<typeof PicksSchema>;

export type ValidationResult = { ok: true; picks: Picks } | { ok: false; error: string };

/**
 * Guardrail against hallucinated venues: every recommended place_id must be one the agent
 * actually received from a tool call in this run. Duplicates are rejected too.
 */
export function validatePicks(input: unknown, seenIds: ReadonlySet<string>): ValidationResult {
  const parsed = PicksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid picks: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  const ids = parsed.data.picks.map((p) => p.place_id);
  const unknown = ids.filter((id) => !seenIds.has(id));
  if (unknown.length) return { ok: false, error: `Unknown place_id(s) ${unknown.join(", ")}: only recommend places returned by search_places or get_place_details.` };
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Each place may be picked only once." };
  return { ok: true, picks: parsed.data };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const PlanSchema = z.object({
  intro: z.string().max(400),
  stops: z
    .array(
      z.object({
        place_id: z.string().min(1),
        time: z.string().regex(HHMM, "time must be HH:MM"),
        duration_min: z.number().int().min(15).max(240),
        what: z.string().min(1).max(80),
        why: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(5),
});
export type Plan = z.infer<typeof PlanSchema>;

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/**
 * Validates an evening plan: places must come from tool results, times must move forward
 * (crossing midnight is fine), start no earlier than ~now, and every stop must be open at
 * its planned time when we know the hours (`openAt` returns null when unknown).
 */
export function validatePlan(
  input: unknown,
  seenIds: ReadonlySet<string>,
  nowMinutes: number,
  openAt: (placeId: string, minutesFromMidnight: number, dayOffset: number) => boolean | null = () => null,
): { ok: true; plan: Plan } | { ok: false; error: string } {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid plan: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  const { stops } = parsed.data;
  const unknown = stops.filter((s) => !seenIds.has(s.place_id)).map((s) => s.place_id);
  if (unknown.length) return { ok: false, error: `Unknown place_id(s) ${unknown.join(", ")}: only use places returned by tools.` };
  if (new Set(stops.map((s) => s.place_id)).size !== stops.length) return { ok: false, error: "Each place may appear only once in the plan." };

  // Absolute minutes since today's midnight, adding a day each time the clock wraps.
  let day = toMin(stops[0].time) < nowMinutes - 30 ? 1 : 0;
  let prevStart = -1;
  let prevEnd = -1;
  for (const s of stops) {
    let abs = day * 1440 + toMin(s.time);
    if (prevStart >= 0 && abs <= prevStart) {
      day += 1; // e.g. 23:30 → 00:30
      abs += 1440;
    }
    if (prevEnd >= 0 && abs < prevEnd - 10) return { ok: false, error: `Stop at ${s.time} starts before the previous one ends; leave time to walk.` };
    if (prevEnd >= 0 && abs - prevEnd > 3 * 60) return { ok: false, error: `Gap before ${s.time} is too long; keep the evening continuous.` };
    if (openAt(s.place_id, toMin(s.time), day) === false) return { ok: false, error: `${s.place_id} is closed at ${s.time}. Check hours with get_place_details and pick another time or place.` };
    prevStart = abs;
    prevEnd = abs + s.duration_min;
  }
  return { ok: true, plan: parsed.data };
}
