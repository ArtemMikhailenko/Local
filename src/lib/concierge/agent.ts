import { z } from "zod";
import { distanceMeters, walkingMinutes, type LatLng } from "@/lib/geo";
import type { LlmFactory, ToolCall, ToolResult, ToolSpec } from "@/lib/llm/types";
import type { Place, PlacesProvider } from "@/lib/places/types";
import { validatePicks, validatePlan, type Picks, type Plan } from "./picks";

export type ConciergeEvent =
  | { t: "status"; text: string }
  | { t: "search"; query: string; count: number }
  | { t: "inspect"; name: string }
  | { t: "result"; intro: string; picks: Array<Picks["picks"][number] & { place: Place }> }
  | { t: "plan"; intro: string; stops: Array<Plan["stops"][number] & { place: Place; walk_min: number }> }
  | { t: "error"; message: string }
  /** Timing/diagnostics; ignored by the UI, useful when watching the raw stream. */
  | { t: "debug"; text: string };

export type ConciergeInput = {
  prompt: string;
  center: LatLng;
  localTime: string;
  savedNames: string[];
  weather?: string;
  lang?: "en" | "uk";
  previous?: Array<{ prompt: string; picked: string[] }>;
};

export type ConciergeDeps = {
  llm: LlmFactory;
  places: PlacesProvider;
  emit: (e: ConciergeEvent) => void;
  maxTurns?: number;
  signal?: AbortSignal;
  /** Minutes since local midnight now, and an hours check for plan validation (null = unknown hours). */
  nowMinutes?: number;
  openAt?: (place: Place, minutesOfDay: number, dayOffset: number) => boolean | null;
};

const MAX_TOOL_USES_PER_TURN = 4;

export const SYSTEM_PROMPT = `You are Locali, a warm, sharp local concierge, like a great hotel concierge who knows every street.
A guest describes what they want; you find 1–3 real places that fit and explain why in a sentence or two each.

How to work:
- Always ground recommendations in tool results. Use search_places (you can call it several times in parallel with different angles, e.g. "wine bar" and "rooftop bar"), and get_place_details when hours, reviews or vibe matter.
- Respect hard constraints from the guest: party size, kids, budget, open now, walking distance, diet. If none fit perfectly, pick the closest options and say what is off.
- Prefer variety (not three of the same kind) unless the guest asked for one kind.
- Reasons must be concrete: mention rating, walking time, price, a dish or detail from the summary/reviews. No generic praise.
- Use the weather line: when it rains or is cold, favour indoor places and short walks; when it is pleasant, terraces are a plus.
- If the guest wants a plan for an evening, a few hours, a date or a route with several stops, build a timeline instead: 2–5 stops starting from now, realistic durations, short walks between stops, every place open at its planned time (check hours with get_place_details). Finish with present_plan.
- Otherwise finish by calling present_picks exactly once. Never write the recommendations as plain text.
- Write in the same language the guest used. Keep "intro" to one friendly sentence.`;

export const TOOLS: ToolSpec[] = [
  {
    name: "search_places",
    description:
      "Search venues near the guest. Returns up to 8 places with id, rating, price level (1-4), walking minutes, open status and a short summary.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in English works best, e.g. 'cozy wine bar', 'brunch with kids area'." },
        open_now: { type: "boolean", description: "Only places open right now." },
        max_price: { type: "integer", minimum: 1, maximum: 4, description: "Upper price level, 1 = cheap, 4 = very expensive." },
        radius_m: { type: "integer", minimum: 200, maximum: 20000, description: "Search radius in meters, default 2500." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_place_details",
    description: "Full details for one place: opening hours by weekday, recent reviews, website, phone.",
    parameters: {
      type: "object",
      properties: { place_id: { type: "string" } },
      required: ["place_id"],
      additionalProperties: false,
    },
  },
  {
    name: "present_picks",
    description: "Return the final 1-3 recommendations to the guest. Call once, at the end.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string", description: "One friendly sentence." },
        picks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              place_id: { type: "string" },
              headline: { type: "string", description: "Max 6 words, e.g. 'Sunset cocktails, 8 min away'." },
              why: { type: "string", description: "1-2 sentences, concrete reasons tied to the request." },
              tip: { type: "string", description: "Insider tip, or empty string." },
            },
            required: ["place_id", "headline", "why", "tip"],
            additionalProperties: false,
          },
        },
      },
      required: ["intro", "picks"],
      additionalProperties: false,
    },
  },
  {
    name: "present_plan",
    description: "Return a timed plan for the evening (2-5 stops). Use instead of present_picks when the guest wants an itinerary.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string", description: "One friendly sentence." },
        stops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              place_id: { type: "string" },
              time: { type: "string", description: "Local start time, HH:MM (24h)." },
              duration_min: { type: "integer", description: "How long to stay, 15-240." },
              what: { type: "string", description: "Max 5 words, e.g. 'Dinner', 'Cocktails on the roof'." },
              why: { type: "string", description: "One concrete sentence." },
            },
            required: ["place_id", "time", "duration_min", "what", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["intro", "stops"],
      additionalProperties: false,
    },
  },
];

const SearchInput = z.object({
  query: z.string().min(1).max(120),
  open_now: z.boolean().optional(),
  max_price: z.number().int().min(1).max(4).optional(),
  radius_m: z.number().int().min(200).max(20000).optional(),
});
const DetailsInput = z.object({ place_id: z.string().min(1).max(200) });

export function compactPlace(p: Place, center: LatLng) {
  const d = distanceMeters(center, p.location);
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    rating: p.rating,
    reviews: p.ratingCount,
    price: p.priceLevel,
    walk_min: walkingMinutes(d),
    open_now: p.openNow,
    summary: p.summary,
  };
}

export function buildUserMessage(input: ConciergeInput): string {
  const lines = [
    `Local time: ${input.localTime}`,
    `Guest location: ${input.center.lat.toFixed(4)}, ${input.center.lng.toFixed(4)}`,
  ];
  if (input.weather) lines.push(`Weather now: ${input.weather}`);
  if (input.savedNames.length) lines.push(`Places the guest has saved before (taste signal): ${input.savedNames.slice(0, 15).join(", ")}`);
  for (const prev of input.previous ?? []) lines.push(`Earlier request: "${prev.prompt}" → suggested ${prev.picked.join(", ")}`);
  if (input.lang === "uk") lines.push("Interface language: Ukrainian. Write intro, headlines, reasons and tips in Ukrainian.");
  lines.push("", `Guest request: ${input.prompt}`);
  return lines.join("\n");
}

/** Agentic loop: we own it to stream progress events and to validate the final answer. Provider-agnostic. */
export async function runConcierge(input: ConciergeInput, deps: ConciergeDeps): Promise<Picks | null> {
  const { llm, places, emit, maxTurns = 6, signal } = deps;
  const seen = new Map<string, Place>();
  const searched = new Set<string>();
  const session = llm({ system: SYSTEM_PROMPT, tools: TOOLS, userMessage: buildUserMessage(input), signal });
  emit({ t: "status", text: "Reading your request" });

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) return null;
    const started = Date.now();
    const { toolCalls, refused, text, model } = await session.next();
    emit({ t: "debug", text: `turn ${turn + 1}: ${((Date.now() - started) / 1000).toFixed(1)}s, ${toolCalls.length} tool call(s)${model ? ` via ${model}` : ""}${toolCalls.length ? "" : `, text: ${text.slice(0, 80)}`}` });
    if (refused) {
      emit({ t: "error", message: "The concierge could not help with that request." });
      return null;
    }
    if (toolCalls.length === 0) {
      // Model answered in prose instead of calling present_picks: nudge it.
      session.addUserText("Please call present_picks with your recommendations.");
      continue;
    }

    let final: Picks | null = null;
    let plan: Plan | null = null;
    const results: ToolResult[] = await Promise.all(
      toolCalls.map(async (call, i) => {
        // Cost guard: a single turn may not fan out into unlimited API calls.
        const searchKey = call.name === "search_places" ? JSON.stringify(call.input) : null;
        let out: Awaited<ReturnType<typeof executeTool>>;
        if (i >= MAX_TOOL_USES_PER_TURN) out = { content: `Skipped: at most ${MAX_TOOL_USES_PER_TURN} tool calls per turn.`, isError: true };
        else if (searchKey && searched.has(searchKey)) out = { content: "You already ran this exact search; use those results or try a different angle.", isError: true };
        else {
          if (searchKey) searched.add(searchKey);
          out = await executeTool(call, input.center, places, seen, emit, deps);
        }
        if (out.final) final = out.final;
        if (out.plan) plan = out.plan;
        return { id: call.id, name: call.name, content: out.content, isError: out.isError };
      }),
    );
    if (plan) {
      const p = plan as Plan;
      emit({
        t: "plan",
        intro: p.intro,
        stops: p.stops.map((s, i) => {
          const place = seen.get(s.place_id)!;
          const from = i === 0 ? input.center : seen.get(p.stops[i - 1].place_id)!.location;
          return { ...s, place, walk_min: walkingMinutes(distanceMeters(from, place.location)) };
        }),
      });
      return { intro: p.intro, picks: p.stops.map((s) => ({ place_id: s.place_id, headline: s.what, why: s.why, tip: s.time })) };
    }
    if (final) {
      const picks = final as Picks;
      emit({ t: "result", intro: picks.intro, picks: picks.picks.map((p) => ({ ...p, place: seen.get(p.place_id)! })) });
      return picks;
    }
    // Promise.all keeps call order, so results line up with the calls.
    session.addToolResults(results);
    // Keep runs short: after a couple of research rounds, ask for the answer.
    if (turn === maxTurns - 3) session.addUserText("You have enough information now. Choose and call present_picks (or present_plan) in your next reply.");
  }
  emit({ t: "error", message: "The concierge took too long. Try a more specific request." });
  return null;
}

async function executeTool(
  tool: ToolCall,
  center: LatLng,
  places: PlacesProvider,
  seen: Map<string, Place>,
  emit: (e: ConciergeEvent) => void,
  deps: Pick<ConciergeDeps, "nowMinutes" | "openAt"> = {},
): Promise<{ content: string; isError?: boolean; final?: Picks; plan?: Plan }> {
  try {
    if (tool.name === "search_places") {
      const args = SearchInput.parse(tool.input);
      const found = await places.search({
        query: args.query,
        center,
        openNow: args.open_now,
        maxPrice: args.max_price,
        radiusM: args.radius_m ?? 2500,
        limit: 8,
      });
      found.forEach((p) => seen.set(p.id, p));
      emit({ t: "search", query: args.query, count: found.length });
      return { content: JSON.stringify(found.map((p) => compactPlace(p, center))) };
    }
    if (tool.name === "get_place_details") {
      const { place_id } = DetailsInput.parse(tool.input);
      const p = await places.details(place_id);
      if (!p) return { content: "Place not found", isError: true };
      seen.set(p.id, p);
      emit({ t: "inspect", name: p.name });
      return {
        content: JSON.stringify({ ...compactPlace(p, center), hours: p.hours, reviews: p.reviews.slice(0, 3).map((r) => `${r.rating}★ ${r.text.slice(0, 220)}`) }),
      };
    }
    if (tool.name === "present_picks") {
      const v = validatePicks(tool.input, new Set(seen.keys()));
      if (!v.ok) return { content: v.error, isError: true };
      return { content: "Delivered to the guest.", final: v.picks };
    }
    if (tool.name === "present_plan") {
      const now = deps.nowMinutes ?? 18 * 60;
      const v = validatePlan(tool.input, new Set(seen.keys()), now, (id, m, d) => (deps.openAt ? deps.openAt(seen.get(id)!, m, d) : null));
      if (!v.ok) return { content: v.error, isError: true };
      return { content: "Delivered to the guest.", plan: v.plan };
    }
    return { content: `Unknown tool ${tool.name}`, isError: true };
  } catch (err) {
    const msg = err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => i.message).join("; ")}` : "Tool failed, try another query.";
    return { content: msg, isError: true };
  }
}
