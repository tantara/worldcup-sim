/**
 * Types for the 2026 FIFA World Cup dataset (`@worldcupsim/wc26-data`).
 *
 * Some source fields are not yet reliably published for every team/match, so a
 * number of fields are nullable. See README for per-team data-completeness notes.
 */

export type Confederation =
  | "UEFA"
  | "CONMEBOL"
  | "CONCACAF"
  | "CAF"
  | "AFC"
  | "OFC";

export type Position = "GK" | "DF" | "MF" | "FW";

export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export type KnockoutRound =
  | "Round of 32"
  | "Round of 16"
  | "Quarter-final"
  | "Semi-final"
  | "Third-place play-off"
  | "Final";

export type Round = "Group Stage" | KnockoutRound;

export interface Player {
  /** Shirt number; `null` where not yet published. */
  number: number | null;
  name: string;
  position: Position;
  /** Club at time of selection; `null` where not published. */
  club: string | null;
  /** Senior international caps; `null` where not published. */
  caps: number | null;
  /** Date of birth, `YYYY-MM-DD`; `null` where not published. */
  dob: string | null;
}

export interface Team {
  country: string;
  group: GroupLetter;
  confederation: Confederation;
  /** Head coach full name. */
  manager: string;
  /** Up to 26 players. */
  players: Player[];
}

export interface SquadsFile {
  tournament: string;
  hosts: string[];
  dates: string;
  format: string;
  source: string;
  notes: string;
  teams: Team[];
}

export interface Venue {
  stadium: string;
  city: string;
  country: string;
}

export interface Match {
  /** FIFA match number, 1–104. */
  match: number;
  round: Round;
  /** Group letter for group-stage matches, `null` for knockouts. */
  group: GroupLetter | null;
  /** Match date, `YYYY-MM-DD`. */
  date: string;
  /** Local kickoff time `HH:MM` (24h); `null` where not published. */
  kickoff_local: string | null;
  /** Team name for group matches; bracket placeholder for knockouts (e.g. "Winner Group A", "Winner Match 73"). */
  home: string;
  away: string;
  venue: string;
  city: string;
  country: string;
}

export interface ScheduleFile {
  tournament: string;
  hosts: string[];
  dates: string;
  format: string;
  source: string;
  venues: Venue[];
  matches: Match[];
}
