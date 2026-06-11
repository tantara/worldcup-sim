# @worldcupsim/wc26-data

Processed **2026 FIFA World Cup** dataset, bundled as typed JSON. No build step —
import the values directly.

- **48 teams** (12 groups of 4) with confederation, head coach, and full 26-player squads.
- **Group tier helpers** derived from each team's FIFA ranking within its group.
- **104 matches** (72 group-stage + 32 knockout) with date, local kickoff, venue, and city.
- **16 host stadiums** across Canada, Mexico, and the USA.
- **48 qualification campaigns** with method, W-D-L/GF-GA record, and match-level results.
- **48 team theme colors** (primary + secondary) from national-team kit/flag identity.

## Usage

```ts
import {
  teams,
  matches,
  venues,
  qualificationCampaigns,
  teamColors,
  getTeam,
  getTeamGroupTier,
  getGroupTierInfo,
  getQualificationCampaign,
  getTeamColors,
  getTeamsByGroup,
  getMatch,
  getMatchesByGroup,
} from "@worldcupsim/wc26-data";
import type { Team, Match, Player, TeamColors } from "@worldcupsim/wc26-data";

getTeam("Argentina")?.manager;        // "Lionel Scaloni"
getTeamGroupTier("Czech Republic")?.label; // "Tier 3"
getGroupTierInfo("A").map((t) => `${t.country}: ${t.label}`);
getQualificationCampaign("England")?.record.wins; // 8
getTeamColors("Brazil");              // { country: "Brazil", primary: "#FFDF00", secondary: "#009C3B" }
getTeamsByGroup("L").map((t) => t.country); // ["England", "Croatia", "Ghana", "Panama"]
getMatch(104);                        // the Final at MetLife Stadium
getMatchesByGroup("A").length;        // 6
```

Raw JSON is also exported:

```ts
import squads from "@worldcupsim/wc26-data/squads.json";
import schedule from "@worldcupsim/wc26-data/schedule.json";
import qualification from "@worldcupsim/wc26-data/qualification.json";
import colors from "@worldcupsim/wc26-data/colors.json";
```

## Shape

`Team`: `{ country, group, confederation, manager, players: Player[] }`
`TeamGroupTier`: `{ country, group, tier, groupRank, fifaRanking, label }`
`Player`: `{ number, name, position, club, caps, dob }`
`Match`: `{ match, round, group, date, kickoff_local, home, away, venue, city, country }`
`QualificationCampaign`: `{ country, confederation, method, record, results }`
`TeamColors`: `{ country, primary, secondary }` (hex strings)

For knockout matches, `group` is `null` and `home`/`away` are bracket placeholders
(e.g. `"Winner Group A"`, `"Winner Match 73"`) until teams are decided.

Group tiers are derived, not separately sourced: for each four-team group, teams
are sorted by FIFA ranking from strongest to weakest and labeled `Tier 1` through
`Tier 4`.

## Data source & completeness

Squads were compiled from Wikipedia's *2026 FIFA World Cup squads* (finalized
2026-06-01), cross-checked against ESPN / Al Jazeera / Sky. The schedule comes
from Wikipedia's group/knockout-stage articles and FIFA fixtures (kickoff times
are **local**).

Qualification campaigns were extracted from the Wikipedia confederation
qualification pages (UEFA, CONMEBOL, AFC, CAF, CONCACAF, OFC). Hosts Canada,
Mexico, and the United States qualified automatically and therefore have empty
qualification result lists. Match dates are intentionally omitted because the
source matrices do not expose dates consistently across confederations.

Some fields are `null` where not yet reliably published:

- **Brazil** — `caps` null throughout (DOB present).
- **Haiti** — clubs/caps/DOB mostly null (names + positions only).
- **Morocco, Scotland, Croatia, Ghana, Panama** — `number`/`caps`/`dob` largely null.
- **England** — numbers + clubs present, `caps`/`dob` null.

All other teams have full 26-player squads with numbers, clubs, caps, and DOB.

### Corrections applied after audit

Cross-checked against Wikipedia/FIFA (June 2026). Fixes: Argentina now complete at 26
(added Leonardo Balerdi, #2, Marseille); James Rodríguez → Minnesota United (was Club León);
Marc Guéhi → Manchester City (transferred Jan 2026); Sherzod Nasrullaev → Nasaf.
Austria's Dejan Ljubičić (#19) was confirmed *correct* — he is the late call-up replacing
the injured Christoph Baumgartner. Brazil's two "Danilo" entries are two different players
(RB at Flamengo #13, MF at Botafogo #18), not a duplicate.
