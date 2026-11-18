import { z } from "zod";
import { distanceMeters, walkingMinutes, type LatLng } from "@/lib/geo";
import type { LlmFactory, ToolCall, ToolResult, ToolSpec } from "@/lib/llm/types";
import type { Place, PlacesProvider } from "@/lib/places/types";
import { validatePicks, type Picks } from "./picks";

export type ConciergeEvent =
  | { t: "status"; text: string }
  | { t: "search"; query: string; count: number }
  | { t: "inspect"; name: string }
  | { t: "result"; intro: string; picks: Array<Picks["picks"][number] & { place: Place }> }
  | { t: "error"; message: string };

export type ConciergeInput = {
  prompt: string;
  center: LatLng;
  localTime: string;
  savedNames: string[];
  previous?: Array<{ prompt: string; picked: string[] }>;
};

export type ConciergeDeps = {
  llm: LlmFactory;
  places: PlacesProvider;
  emit: (e: ConciergeEvent) => void;
  maxTurns?: number;
  signal?: AbortSignal;
};

const MAX_TOOL_USES_PER_TURN = 4;

export const SYSTEM_PROMPT = `You are Locali, a warm, sharp local concierge, like a great hotel concierge who knows every street.
A guest describes what they want; you find 1–3 real places that fit and explain why in a sentence or two each.

How to work:
- Always ground recommendations in tool results. Use search_places (you can call it several times in parallel with different angles, e.g. "wine bar" and "rooftop bar"), and get_place_details when hours, reviews or vibe matter.
- Respect hard constraints from the guest: party size, kids, budget, open now, walking distance, diet. If none fit perfectly, pick the closest options and say what is off.
- Prefer variety (not three of the same kind) unless the guest asked for one kind.
- Reasons must be concrete: mention rating, walking time, price, a dish or detail from the summary/reviews. No generic praise.
- Finish by calling present_picks exactly once. Do not write the recommendations as plain text.
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
  if (input.savedNames.length) lines.push(`Places the guest has saved before (taste signal): ${input.savedNames.slice(0, 15).join(", ")}`);
  for (const prev of input.previous ?? []) lines.push(`Earlier request: "${prev.prompt}" → suggested ${prev.picked.join(", ")}`);
  lines.push("", `Guest request: ${input.prompt}`);
  return lines.join("\n");
}

/** Agentic loop: we own it to stream progress events and to validate the final answer. Provider-agnostic. */
export async function runConcierge(input: ConciergeInput, deps: ConciergeDeps): Promise<Picks | null> {
  const { llm, places, emit, maxTurns = 6, signal } = deps;
  const seen = new Map<string, Place>();
  const session = llm({ system: SYSTEM_PROMPT, tools: TOOLS, userMessage: buildUserMessage(input), signal });
  emit({ t: "status", text: "Reading your request" });

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) return null;
    const { toolCalls, refused } = await session.next();
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
    const results: ToolResult[] = await Promise.all(
      toolCalls.map(async (call, i) => {
        // Cost guard: a single turn may not fan out into unlimited API calls.
        const out =
          i < MAX_TOOL_USES_PER_TURN
            ? await executeTool(call, input.center, places, seen, emit)
            : { content: `Skipped: at most ${MAX_TOOL_USES_PER_TURN} tool calls per turn.`, isError: true };
        if (out.final) final = out.final;
        return { id: call.id, name: call.name, content: out.content, isError: out.isError };
      }),
    );
    if (final) {
      const picks = final as Picks;
      emit({ t: "result", intro: picks.intro, picks: picks.picks.map((p) => ({ ...p, place: seen.get(p.place_id)! })) });
      return picks;
    }
    // Promise.all keeps call order, so results line up with the calls.
    session.addToolResults(results);
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
): Promise<{ content: string; isError?: boolean; final?: Picks }> {
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
    return { content: `Unknown tool ${tool.name}`, isError: true };
  } catch (err) {
    const msg = err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => i.message).join("; ")}` : "Tool failed, try another query.";
    return { content: msg, isError: true };
  }
}
