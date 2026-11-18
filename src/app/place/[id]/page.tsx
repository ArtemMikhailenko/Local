import type { Metadata } from "next";
import { places } from "@/lib/places";
import { PlaceClient } from "./place-client";

/** Shared place links show the venue name, type and photo in messengers. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const p = await places.details(id);
    if (!p) return { title: "Locali" };
    const description = [p.type, p.rating ? `★ ${p.rating.toFixed(1)}` : null, p.address].filter(Boolean).join(" · ");
    return {
      title: `${p.name} · Locali`,
      description,
      openGraph: { title: p.name, description, images: p.photos[0] ? [p.photos[0]] : undefined },
    };
  } catch {
    return { title: "Locali" };
  }
}

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaceClient id={id} />;
}
