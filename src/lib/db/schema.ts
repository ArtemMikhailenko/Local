import { customType, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import type { Place } from "@/lib/places/types";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Only the SHA-256 of the session token is stored, so a DB leak does not leak live sessions. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const savedPlaces = pgTable(
  "saved_places",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    snapshot: jsonb("snapshot").$type<Place>().notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.placeId] })],
);

/** Shared cache of OpenStreetMap venues per ~1 km cell, so cold serverless instances skip the slow Overpass call. */
export const areaCache = pgTable("area_cache", {
  cell: text("cell").primaryKey(),
  venues: jsonb("venues").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** "Decide together": a short-lived shortlist friends vote on via an unguessable link. */
export const polls = pgTable("polls", {
  id: text("id").primaryKey(), // 12-char random slug, the only way to reach the poll
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  places: jsonb("places").$type<Place[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull(), // random per-browser id from an httpOnly cookie, not a user account
    placeId: text("place_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.voterId] })],
);

/** Cover photo found on a venue's own website (og:image); url null = looked, nothing usable. */
export const sitePhotos = pgTable("site_photos", {
  placeId: text("place_id").primaryKey(),
  url: text("url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Concierge conversations of signed-in users, synced across devices. */
export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    turns: jsonb("turns").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chats_user_idx").on(t.userId)],
);

/** A meetup at a place: shareable invite with RSVPs (no account needed to answer). */
export const events = pgTable("events", {
  id: text("id").primaryKey(), // 12-char random slug
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  place: jsonb("place").$type<Place>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  note: text("note"),
  /** private: only people with the link see it. public: shown to everyone on the map (needs an account). */
  visibility: text("visibility").$type<"private" | "public">().notNull().default("private"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("events_public_idx").on(t.visibility, t.startsAt)]);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull(), // same anonymous per-browser cookie as votes
    name: text("name").notNull(),
    status: text("status").$type<"going" | "maybe" | "no">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.voterId] })],
);

export const conciergeRuns = pgTable(
  "concierge_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("concierge_runs_user_idx").on(t.userId)],
);

/**
 * Which Google Street View panorama looks at a venue, found once with the free metadata call.
 * Only the pano id and camera heading are kept (allowed by Google's terms), never the image.
 * status "none" means no outdoor panorama nearby; it is re-checked after 30 days.
 */
export const streetViews = pgTable("street_views", {
  key: text("key").primaryKey(), // "lat,lng" rounded to 5 decimals (~1 m)
  panoId: text("pano_id"),
  heading: integer("heading"),
  status: text("status").$type<"ok" | "none">().notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Daily counters for paid APIs, so a free quota can never turn into a bill. */
export const apiUsage = pgTable(
  "api_usage",
  {
    day: text("day").notNull(), // YYYY-MM-DD (UTC)
    api: text("api").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.api] })],
);

/**
 * Google photo URLs (googleusercontent) per place photo, kept 3 days so each photo costs one
 * Places request per 3 days instead of one per viewer per day. Demo shortcut: Google's terms
 * do not allow storing their content, so production would drop this table (see README).
 */
export const googlePhotos = pgTable("google_photos", {
  key: text("key").primaryKey(), // "{placeId}:{index}"
  uri: text("uri").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Venue photo files copied from Google, served from our own database forever after the first
 * fetch: one Places photo request per photo, ever. Demo shortcut (Google's terms forbid storing
 * their photos); production would delete this table and pay per view. See README.
 */
export const photoFiles = pgTable("photo_files", {
  key: text("key").primaryKey(), // "{placeId}:{index}"
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
