import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { runConcierge, type ConciergeEvent } from "@/lib/concierge/agent";
import { DEFAULT_CENTER } from "@/lib/geo";
import { llmProvider } from "@/lib/llm";
import { LlmRateLimitError } from "@/lib/llm/types";
import { HttpError, assertSameOrigin, clientIp, handleError } from "@/lib/http";
import { places } from "@/lib/places";
import { openAtFromHours } from "@/lib/places/osm";
import { geocode } from "@/lib/geocode";
import { getWeather, weatherHint } from "@/lib/weather";
import { env } from "@/lib/env";
import { anonConciergeLimiter, conciergeLimiter } from "@/lib/ratelimit";

export const maxDuration = 60;
const DEADLINE_MS = 50_000; // finish (with an error event) before the platform kills the function

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
        const emit = (e: ConciergeEvent) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          } catch {
            closed = true; // client went away
          }
        };
        // Stop spending tokens when the client disconnects or the deadline passes.
        const abort = new AbortController();
        req.signal.addEventListener("abort", () => abort.abort());
        const timer = setTimeout(() => {
          emit({ t: "error", message: "That took too long. Try a more specific request." });
          abort.abort();
        }, DEADLINE_MS);
        try {
          const picks = await runConcierge(
            { prompt: body.data.prompt, center, localTime, savedNames, previous: body.data.previous, lang: body.data.lang, weather: weather ? weatherHint(weather) : undefined },
            {
              llm: await provider.factory(),
              places,
              emit,
              signal: abort.signal,
              nowMinutes: hh * 60 + mm,
              geocode: async (near) => (await geocode(near, { geoapifyKey: env.geoapifyKey || undefined, near: center, limit: 1 }))[0]?.location ?? null,
              // Hours are machine-checkable for OpenStreetMap venues; other providers return null (unknown).
              openAt: (place, minutes, dayOffset) => (place.id.startsWith("osm_") ? openAtFromHours(place.hours.join("; "), now, env.timeZone, minutes, dayOffset) : null),
            },
          );
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
