import {
  getTeam as getWcTeam,
  getTeamColors,
  getTeamGroupTier,
  getQualificationCampaign,
  getTeamsByGroup,
  teams as wcTeams,
  type Confederation,
  type GroupLetter,
  type QualificationCampaign,
  type Player as WcPlayer,
  type Team as WcTeam,
  type TeamGroupTier,
} from "@worldcupsim/wc26-data";

export type Player = {
  number: number;
  name: string;
  position: "GK" | "DF" | "MF" | "FW";
};

/** A single kit's colors. */
export type Kit = { primary: string; secondary: string };

export type Team = {
  id: string;
  name: string;
  flag: string;
  group: GroupLetter;
  confederation: Confederation;
  manager: string;
  /** FIFA/Coca-Cola Men's World Ranking position (1 April 2026 edition). */
  fifaRanking: number;
  /** Derived from FIFA ranking within this World Cup group. Tier 1 is strongest. */
  groupTier: TeamGroupTier;
  /** Overall strength, ~70-92. Drives the simulation. */
  rating: number;
  /** Derived from the selected XI, e.g. "4-3-3". */
  formation: string;
  qualification: QualificationCampaign | null;
  colors: { primary: string; secondary: string };
  squad: Player[];
};

// Emoji flags for all 48 finalists (subdivision flags for England/Scotland).
const FLAGS: Record<string, string> = {
  "Czech Republic": "🇨🇿",
  Mexico: "🇲🇽",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  "Bosnia and Herzegovina": "🇧🇦",
  Canada: "🇨🇦",
  Qatar: "🇶🇦",
  Switzerland: "🇨🇭",
  Brazil: "🇧🇷",
  Haiti: "🇭🇹",
  Morocco: "🇲🇦",
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Australia: "🇦🇺",
  Paraguay: "🇵🇾",
  Turkey: "🇹🇷",
  "United States": "🇺🇸",
  "Curaçao": "🇨🇼",
  Ecuador: "🇪🇨",
  Germany: "🇩🇪",
  "Ivory Coast": "🇨🇮",
  Japan: "🇯🇵",
  Netherlands: "🇳🇱",
  Sweden: "🇸🇪",
  Tunisia: "🇹🇳",
  Belgium: "🇧🇪",
  Egypt: "🇪🇬",
  Iran: "🇮🇷",
  "New Zealand": "🇳🇿",
  "Cape Verde": "🇨🇻",
  "Saudi Arabia": "🇸🇦",
  Spain: "🇪🇸",
  Uruguay: "🇺🇾",
  France: "🇫🇷",
  Iraq: "🇮🇶",
  Norway: "🇳🇴",
  Senegal: "🇸🇳",
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Austria: "🇦🇹",
  Jordan: "🇯🇴",
  Colombia: "🇨🇴",
  "DR Congo": "🇨🇩",
  Portugal: "🇵🇹",
  Uzbekistan: "🇺🇿",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Croatia: "🇭🇷",
  Ghana: "🇬🇭",
  Panama: "🇵🇦",
};

const CONFED_BASE: Record<Confederation, number> = {
  UEFA: 80,
  CONMEBOL: 80,
  CAF: 76,
  CONCACAF: 75,
  AFC: 75,
  OFC: 72,
};

export function slugify(country: string): string {
  return country
    .toLowerCase()
    .normalize("NFD")
    // strip combining diacritical marks (U+0300–U+036F)
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Strength: confederation baseline nudged by squad experience (avg caps).
// Falls back to the baseline for teams whose caps aren't published yet.
function ratingFor(team: WcTeam): number {
  const base = CONFED_BASE[team.confederation];
  const caps = team.players
    .map((p) => p.caps)
    .filter((c): c is number => c != null);
  const avg =
    caps.length >= 8 ? caps.reduce((a, b) => a + b, 0) / caps.length : null;
  const signal = avg == null ? 0 : clamp((avg - 25) * 0.2, -4, 8);
  return Math.round(clamp(base + signal, 70, 92));
}

// Real national-team theme colors from the dataset, with a deterministic
// hash-based fallback for any country missing curated colors.
function colorsFor(country: string): { primary: string; secondary: string } {
  const curated = getTeamColors(country);
  if (curated) {
    return { primary: curated.primary, secondary: curated.secondary };
  }
  let hash = 0;
  for (let i = 0; i < country.length; i++) {
    hash = (hash * 31 + country.charCodeAt(i)) % 360;
  }
  return {
    primary: `hsl(${hash}, 65%, 48%)`,
    secondary: `hsl(${(hash + 40) % 360}, 60%, 55%)`,
  };
}

// Pick a plausible XI (1 GK, 4 DF, 3 MF, 3 FW) from the 26-player squad,
// filling any gaps from remaining players so we always get 11.
function startingXI(players: WcPlayer[]): Player[] {
  const take = (pos: WcPlayer["position"], n: number) =>
    players.filter((p) => p.position === pos).slice(0, n);

  const xi = [
    ...take("GK", 1),
    ...take("DF", 4),
    ...take("MF", 3),
    ...take("FW", 3),
  ];
  if (xi.length < 11) {
    const chosen = new Set(xi);
    for (const p of players) {
      if (xi.length >= 11) break;
      if (!chosen.has(p)) xi.push(p);
    }
  }
  return xi.slice(0, 11).map((p, i) => ({
    number: p.number ?? i + 1,
    name: p.name,
    position: p.position,
  }));
}

function formationFor(squad: Player[]): string {
  const count = (pos: Player["position"]) =>
    squad.filter((p) => p.position === pos).length;
  return `${count("DF")}-${count("MF")}-${count("FW")}`;
}

function buildTeam(team: WcTeam): Team {
  const squad = startingXI(team.players);
  const groupTier = getTeamGroupTier(team.country);
  if (!groupTier) {
    throw new Error(`Missing group tier for ${team.country}`);
  }

  return {
    id: slugify(team.country),
    name: team.country,
    flag: FLAGS[team.country] ?? "🏳️",
    group: team.group,
    confederation: team.confederation,
    manager: team.manager,
    fifaRanking: team.fifaRanking,
    groupTier,
    rating: ratingFor(team),
    formation: formationFor(squad),
    qualification: getQualificationCampaign(team.country) ?? null,
    colors: colorsFor(team.country),
    squad,
  };
}

export const TEAMS: Team[] = wcTeams.map(buildTeam);

const BY_ID = new Map(TEAMS.map((t) => [t.id, t]));
const BY_COUNTRY = new Map(TEAMS.map((t) => [t.name, t]));

export function getTeam(id: string): Team {
  const team = BY_ID.get(id);
  if (!team) throw new Error(`Unknown team: ${id}`);
  return team;
}

export function findTeam(id: string): Team | undefined {
  return BY_ID.get(id);
}

/** Resolve by exact country name (matches the dataset's `home`/`away` fields). */
export function getTeamByCountry(country: string): Team | undefined {
  return BY_COUNTRY.get(country);
}

export const GROUP_LETTERS: GroupLetter[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** Teams in a group, mapped to the client `Team` shape. */
export function teamsInGroup(group: GroupLetter): Team[] {
  return getTeamsByGroup(group).map(buildTeam);
}

// --- full roster (for the team detail page) ---------------------------------

export type RosterPlayer = {
  number: number | null;
  name: string;
  position: Player["position"];
  club: string | null;
  caps: number | null;
  /** Age at the start of the tournament; `null` where DOB isn't published. */
  age: number | null;
};

const TOURNAMENT_START = new Date("2026-06-11");

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = TOURNAMENT_START.getFullYear() - born.getFullYear();
  const m = TOURNAMENT_START.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && TOURNAMENT_START.getDate() < born.getDate())) age--;
  return age;
}

/** Full 26-player squad (with club/caps/age) for the given team id. */
export function getRoster(id: string): RosterPlayer[] {
  const team = BY_ID.get(id);
  if (!team) return [];
  const wc = getWcTeam(team.name);
  if (!wc) return [];
  return wc.players.map((p) => ({
    number: p.number,
    name: p.name,
    position: p.position,
    club: p.club,
    caps: p.caps,
    age: ageFromDob(p.dob),
  }));
}
