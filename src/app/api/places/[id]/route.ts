import { handleError, json } from "@/lib/http";
import { places } from "@/lib/places";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const place = await places.details(id);
    if (!place) return json({ error: "Place not found" }, 404);
    return json({ place }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    return handleError(err);
  }
}
