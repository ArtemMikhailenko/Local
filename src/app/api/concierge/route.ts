import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { runConcierge, type ConciergeEvent } from "@/lib/concierge/agent";
import { DEFAULT_CENTER } from "@/lib/geo";
import { llmProvider } from "@/lib/llm";
import { LlmRateLimitError } from "@/lib/llm/types";
import { HttpError, assertSameOrigin, clientIp, handleError } from "@/lib/http";
import { conciergePlaces, enrichWithGoogle } from "@/lib/places";
import { openAtFromHours } from "@/lib/places/osm";
import { geocode } from "@/lib/geocode";
import { getWeather, weatherHint } from "@/lib/weather";
import { env } from "@/lib/env";
import { anonConciergeLimiter, conciergeLimiter } from "@/lib/ratelimit";

export const maxDuration = 60;
const DEADLINE_MS = 45_000; // answer (best effort if needed) well before the platform limit

const Body = z.object({
  prompt: z.string().trim().min(3).max(500),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  previous: z
    .array(z.object({ prompt: z.string().max(500), picked: z.array(z.string().max(120)).max(3) }))
    .max(4)
    .optional(),
  lang: z.enum(["en", "uk"]).optional(),
});


/** Streams NDJSON events: progress while the agent searches, then the validated picks. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    const limit = user ? conciergeLimiter.check(`c:${user.id}`) : anonConciergeLimiter.check(`c:${clientIp(req)}`);
    if (!limit.ok) throw new HttpError(429, `Easy there! Try again in ${limit.retryAfterSec}s`);
    const provider = llmProvider();
    if (!provider) throw new HttpError(503, "Concierge is not configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)");
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Tell the concierge a bit more (3+ characters)");

    const savedNames = user
      ? (
          await db
            .select({ place: schema.savedPlaces.snapshot })
            .from(schema.savedPlaces)
            .where(eq(schema.savedPlaces.userId, user.id))
            .orderBy(desc(schema.savedPlaces.createdAt))
            .limit(15)
        ).map((r) => `${r.place.name} (${r.place.type})`)
      : [];

    const center = body.data.lat != null && body.data.lng != null ? { lat: body.data.lat, lng: body.data.lng } : DEFAULT_CENTER;
    const now = new Date();
    const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: env.timeZone, weekday: "long", hour: "2-digit", minute: "2-digit" }).format(now);
    const [hh, mm] = new Intl.DateTimeFormat("en-GB", { timeZone: env.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
    const weather = await getWeather(center);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (e: ConciergeEvent) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          } catch {
            closed = true; // client went away
          }
        };
        // Final answers: upgrade the 2-3 OpenStreetMap picks with Google data before sending.
        const pendingFinal: Promise<void>[] = [];
        const emit = (e: ConciergeEvent) => {
          if (e.t === "result") {
            pendingFinal.push(
              Promise.all(e.picks.map(async (p) => ({ ...p, place: await enrichWithGoogle(p.place) }))).then((picks) => send({ ...e, picks })),
            );
          } else if (e.t === "plan") {
            pendingFinal.push(
              Promise.all(e.stops.map(async (s) => ({ ...s, place: await enrichWithGoogle(s.place) }))).then((stops) => send({ ...e, stops })),
            );
          } else send(e);
        };
        // Stop spending tokens when the client disconnects or the deadline passes.
        const abort = new AbortController();
        req.signal.addEventListener("abort", () => abort.abort());
        const deadline = Date.now() + DEADLINE_MS;
        // Hard stop only for a hung model call; the agent itself wraps up ~13 s before the deadline.
        const timer = setTimeout(() => abort.abort(), DEADLINE_MS - 2_000);
        try {
          const picks = await runConcierge(
            { prompt: body.data.prompt, center, localTime, savedNames, previous: body.data.previous, lang: body.data.lang, weather: weather ? weatherHint(weather) : undefined },
            {
              llm: await provider.factory(),
              places: conciergePlaces,
              emit,
              signal: abort.signal,
              deadline,
              nowMinutes: hh * 60 + mm,
              geocode: async (near) => (await geocode(near, { geoapifyKey: env.geoapifyKey || undefined, near: center, limit: 1 }))[0]?.location ?? null,
              // Hours are machine-checkable for OpenStreetMap venues; other providers return null (unknown).
              openAt: (place, minutes, dayOffset) => (place.id.startsWith("osm_") ? openAtFromHours(place.hours.join("; "), now, env.timeZone, minutes, dayOffset) : null),
            },
          );
          await Promise.all(pendingFinal);
          if (picks && user) {
            await db.insert(schema.conciergeRuns).values({ userId: user.id, prompt: body.data.prompt, result: picks });
          }
        } catch (err) {
          if (abort.signal.aborted) return;
          console.error("concierge failed", err);
          emit({ t: "debug", text: `error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` });
          const message = err instanceof LlmRateLimitError ? "The free AI quota is used up for now. Try again in a minute." : "Something went wrong. Please try again.";
          emit({ t: "error", message });
        } finally {
          clearTimeout(timer);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {}
          }
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
