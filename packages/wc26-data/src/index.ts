/**
 * `@worldcupsim/wc26-data` — processed 2026 FIFA World Cup dataset.
 *
 * Re-exports the squad and schedule JSON as strongly-typed values, plus a few
 * small lookup helpers. Data is bundled as JSON (no build step); consumers
 * import the typed values directly.
 */

import squadsJson from "./data/squads.json";
import scheduleJson from "./data/schedule.json";
import qualificationJson from "./data/qualification.json";
import colorsJson from "./data/colors.json";
import type {
  ColorsFile,
  GroupLetter,
  GroupTier,
  Match,
  QualificationCampaign,
  QualificationFile,
  ScheduleFile,
  SquadsFile,
  Team,
  TeamColors,
  TeamGroupTier,
  TeamKit,
  Venue,
} from "./types";

export const squads = squadsJson as SquadsFile;
export const schedule = scheduleJson as ScheduleFile;
export const qualification = qualificationJson as QualificationFile;
export const colors = colorsJson as ColorsFile;

/** All 48 teams with managers and full squads. */
export const teams: Team[] = squads.teams;

/** All 104 matches (72 group-stage + 32 knockout), ordered by match number. */
export const matches: Match[] = schedule.matches;

/** The 16 host stadiums. */
export const venues: Venue[] = schedule.venues;

/** Qualification campaigns for the 48 finalists, in squad dataset order. */
export const qualificationCampaigns: QualificationCampaign[] =
  qualification.campaigns;

/** Theme colors (primary/secondary) for all 48 teams. */
export const teamColors: TeamColors[] = colors.teams;

type VenueLocation = Venue | Match;

function locationStadium(location: VenueLocation): string {
  return "stadium" in location ? location.stadium : location.venue;
}

/** Look up a team by country name (exact match). */
export function getTeam(country: string): Team | undefined {
  return teams.find((t) => t.country === country);
}

/** All teams in a given group, in dataset order. */
export function getTeamsByGroup(group: GroupLetter): Team[] {
  return teams.filter((t) => t.group === group);
}

function groupTierFromIndex(index: number): GroupTier {
  if (index === 0) return 1;
  if (index === 1) return 2;
  if (index === 2) return 3;
  return 4;
}

/** Group strength tiers derived from FIFA ranking, strongest team first. */
export function getGroupTierInfo(group: GroupLetter): TeamGroupTier[] {
  return [...getTeamsByGroup(group)]
    .sort(
      (a, b) =>
        a.fifaRanking - b.fifaRanking || a.country.localeCompare(b.country),
    )
    .map((team, index) => {
      const tier = groupTierFromIndex(index);
      return {
        country: team.country,
        group,
        tier,
        groupRank: tier,
        fifaRanking: team.fifaRanking,
        label: `Tier ${tier}`,
      };
    });
}

/** Look up a match by its FIFA match number (1–104). */
export function getMatch(matchNumber: number): Match | undefined {
  return matches.find((m) => m.match === matchNumber);
}

/** Look up a finalist's group tier by country name (exact match). */
export function getTeamGroupTier(country: string): TeamGroupTier | undefined {
  const team = getTeam(country);
  if (!team) return undefined;
  return getGroupTierInfo(team.group).find((entry) => entry.country === country);
}

/** Look up a team's theme colors by country name (exact match). */
export function getTeamColors(country: string): TeamColors | undefined {
  return teamColors.find((c) => c.country === country);
}

/** Look up a finalist's qualification campaign by country name (exact match). */
export function getQualificationCampaign(
  country: string,
): QualificationCampaign | undefined {
  return qualificationCampaigns.find((c) => c.country === country);
}

/** Look up a stadium by venue, city, and country. */
export function getVenue(
  stadium: string,
  city?: string,
  country?: string,
): Venue | undefined {
  return venues.find(
    (v) =>
      v.stadium === stadium &&
      (city == null || v.city === city) &&
      (country == null || v.country === country),
  );
}

/** Look up the host stadium record for a match. */
export function getMatchVenue(match: Match): Venue | undefined {
  return getVenue(match.venue, match.city, match.country);
}

/** Google Maps search URL for a venue or match location. */
export function getVenueGoogleMapsUrl(location: VenueLocation): string {
  const stadium = locationStadium(location);
  const venue = getVenue(stadium, location.city, location.country);
  return (
    venue?.googleMapsUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${stadium}, ${location.city}, ${location.country}`,
    )}`
  );
}

/** All matches for a given group, in match-number order. */
export function getMatchesByGroup(group: GroupLetter): Match[] {
  return matches.filter((m) => m.group === group);
}

export type {
  ColorsFile,
  Confederation,
  GroupLetter,
  GroupTier,
  KnockoutRound,
  Match,
  Player,
  Position,
  QualificationCampaign,
  QualificationFile,
  QualificationMatchResult,
  QualificationRecord,
  QualificationResultCode,
  QualificationVenue,
  Round,
  ScheduleFile,
  SquadsFile,
  Team,
  TeamColors,
  TeamGroupTier,
  TeamKit,
  Venue,
} from "./types";
