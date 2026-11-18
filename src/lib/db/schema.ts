import { jsonb, pgTable, primaryKey, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
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
