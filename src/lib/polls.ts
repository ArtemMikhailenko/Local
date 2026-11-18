import { randomBytes } from "node:crypto";

export const VOTER_COOKIE = "locali_voter";
export const POLL_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const POLL_ID_RE = /^[A-Za-z0-9_-]{12}$/;

/** 72 random bits: links cannot be guessed or enumerated. */
export const newPollId = () => randomBytes(9).toString("base64url");
export const newVoterId = () => randomBytes(16).toString("base64url");

export type Tally = { placeId: string; votes: number; voters: string[] };

/** Counts votes per place, keeps the original order for ties, and returns the leader (null when no votes or a tie at the top). */
export function tally(placeIds: string[], votes: Array<{ placeId: string; name: string }>): { rows: Tally[]; leader: string | null } {
  const rows = placeIds.map((placeId) => {
    const mine = votes.filter((v) => v.placeId === placeId);
    return { placeId, votes: mine.length, voters: mine.map((v) => v.name) };
  });
  const max = Math.max(0, ...rows.map((r) => r.votes));
  const top = rows.filter((r) => r.votes === max);
  return { rows, leader: max > 0 && top.length === 1 ? top[0].placeId : null };
}
