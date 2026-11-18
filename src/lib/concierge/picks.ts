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
