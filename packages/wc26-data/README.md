# @worldcupsim/wc26-data

Processed **2026 FIFA World Cup** dataset, bundled as typed JSON. No build step —
import the values directly.

- **48 teams** (12 groups of 4) with confederation, head coach, and full 26-player squads.
- **104 matches** (72 group-stage + 32 knockout) with date, local kickoff, venue, and city.
- **16 host stadiums** across Canada, Mexico, and the USA.

## Usage

```ts
import {
  teams,
  matches,
  venues,
  getTeam,
  getTeamsByGroup,
  getMatch,
  getMatchesByGroup,
} from "@worldcupsim/wc26-data";
import type { Team, Match, Player } from "@worldcupsim/wc26-data";

getTeam("Argentina")?.manager;        // "Lionel Scaloni"
getTeamsByGroup("L").map((t) => t.country); // ["England", "Croatia", "Ghana", "Panama"]
getMatch(104);                        // the Final at MetLife Stadium
getMatchesByGroup("A").length;        // 6
```

Raw JSON is also exported:

```ts
import squads from "@worldcupsim/wc26-data/squads.json";
import schedule from "@worldcupsim/wc26-data/schedule.json";
```

## Shape

`Team`: `{ country, group, confederation, manager, players: Player[] }`
`Player`: `{ number, name, position, club, caps, dob }`
`Match`: `{ match, round, group, date, kickoff_local, home, away, venue, city, country }`

For knockout matches, `group` is `null` and `home`/`away` are bracket placeholders
(e.g. `"Winner Group A"`, `"Winner Match 73"`) until teams are decided.

## Data source & completeness

Squads were compiled from Wikipedia's *2026 FIFA World Cup squads* (finalized
2026-06-01), cross-checked against ESPN / Al Jazeera / Sky. The schedule comes
from Wikipedia's group/knockout-stage articles and FIFA fixtures (kickoff times
are **local**).

Some fields are `null` where not yet reliably published:

- **Brazil** — `caps` null throughout (DOB present).
- **Haiti** — clubs/caps/DOB mostly null (names + positions only).
- **Morocco, Scotland, Croatia, Ghana, Panama** — `number`/`caps`/`dob` largely null.
- **England** — numbers + clubs present, `caps`/`dob` null.
- **Argentina** — 25 of 26 players (shirt #2 missing in source extraction).

All other teams have full 26-player squads with numbers, clubs, caps, and DOB.
