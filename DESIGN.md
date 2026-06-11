# Design

## Source of truth
- Status: Draft
- Last refreshed: 2026-06-11
- Primary product surfaces: Home fixture browser, tournament bracket, match simulator, playground.
- Evidence reviewed: `client/src/app/page.tsx`, `client/src/app/layout.tsx`, `client/src/app/_components/bracket.tsx`, `client/src/app/playground/page.tsx`, `client/src/components/navbar.tsx`, `client/src/styles/globals.css`, `client/public/favicon.ico`.

## Brand
- Personality: Tactical, matchday, data-rich, fast to scan.
- Trust signals: Real 2026 hosts, groups, venues, rankings, schedules, and transparent simulated status.
- Avoid: Generic SaaS hero layouts, overly decorative sports posters, one-color green-only themes, and official FIFA branding.

## Product goals
- Goals: Make the app immediately read as a World Cup simulation tool; make groups, fixtures, bracket, and match simulation feel cohesive.
- Non-goals: Marketing landing page, betting/product odds, official tournament affiliation.
- Success signals: First viewport shows tournament scope, simulation action, and current navigation without explanation.

## Personas and jobs
- Primary personas: Football fans exploring scenarios; builders testing match simulation behavior.
- User jobs: Browse groups and fixtures, open a playable match, inspect venues, simulate matches, review tournament structure.
- Key contexts of use: Desktop exploration and mobile match lookup.

## Information architecture
- Primary navigation: Brand/home, playground, theme control.
- Core routes/screens: `/`, `/match/[matchid]`, `/playground`, `/team/[slug]`.
- Content hierarchy: Tournament identity, simulation call to action, groups/schedule/bracket tabs, detailed match surfaces.

## Design Principles
- Match Control Room: Use dense but organized information with stadium, group, and fixture metadata always near the action.
- Tournament Energy: Use pitch lines, scoreboard forms, badges, and trophy/ball motifs without turning screens into poster art.
- Simulation Clarity: Distinguish playable fixtures, placeholders, live agent output, and simulated results with clear states.
- Tradeoffs: Favor readable operational UI over large editorial imagery; keep motion subtle and optional.

## Visual Language
- Color: Dark stadium base, turf green action color, warm gold trophy accent, red/blue tournament accents for data states.
- Typography: Geist-led sans stack; bold compact headings; tabular numbers for rankings, scores, usage, and costs.
- Spacing/layout rhythm: Tight dashboards with 8-16px component gaps and wider page gutters on desktop.
- Shape/radius/elevation: Cards and controls use restrained radius, usually 8px or less; elevation is subtle and border-led.
- Motion: Short hover/transition feedback only; respect reduced motion.
- Imagery/iconography: Custom vector crest/ball logo, lucide UI icons, pitch-line and bracket motifs.

## Components
- Existing components to reuse: `Badge`, `Button`, `Card`, `Tabs`, `Select`, `ScrollArea`, navbar/footer.
- New/changed components: Brand logo asset, OG image asset, scoreboard-style hero metrics, refined card states.
- Variants and states: Playable, TBD, hover, active tab, venue link, empty/unplayable match.
- Token/component ownership: Tailwind v4 CSS variables in `client/src/styles/globals.css`.

## Accessibility
- Target standard: WCAG AA for text contrast and keyboard navigability.
- Keyboard/focus behavior: Links and buttons remain native focusable; full-card links must not block nested venue links.
- Contrast/readability: Avoid low-contrast green-on-dark combinations; use tabular numbers for scanability.
- Screen-reader semantics: Brand assets need text labels or hidden text; icons stay decorative unless they convey state.
- Reduced motion and sensory considerations: Keep animation minimal; no flashing or autoplay media.

## Responsive Behavior
- Supported breakpoints/devices: Mobile phones through desktop monitors.
- Layout adaptations: Single-column mobile, multi-column groups/schedule on tablet/desktop, horizontally scrollable bracket.
- Touch/hover differences: Preserve hit targets at mobile sizes and avoid hover-only information.

## Interaction States
- Loading: Use existing route/server rendering; client simulator should preserve visible phase labels.
- Empty: Unplayable knockout placeholders explain why teams are TBD.
- Error: Playground and agent surfaces show clear error text.
- Success: Simulated results and final states should read as unofficial simulation.
- Disabled: TBD fixtures are visually subdued and non-clickable.
- Offline/slow network, if applicable: Agent playground should show waiting/streaming state without layout shifts.

## Content Voice
- Tone: Direct, matchday, precise.
- Terminology: Use "fixture", "group", "kickoff", "venue", "simulate", and "unofficial".
- Microcopy rules: Keep descriptions short; do not explain obvious controls in visible UI copy.

## Implementation Constraints
- Framework/styling system: Next.js App Router, React, Tailwind v4, shadcn-style local UI components.
- Design-token constraints: Extend existing CSS custom properties rather than adding a separate token system.
- Performance constraints: Prefer SVG/vector assets and CSS motifs over large decorative images.
- Compatibility constraints: Do not use official FIFA marks or protected tournament branding.
- Test/screenshot expectations: Run `pnpm check`; use a browser smoke test after significant visual changes.

## Open Questions
- [ ] Confirm whether the product name should remain "World Cup Simulator" or use "WorldCupSim" consistently.
- [ ] Confirm whether future art direction should include generated stadium imagery or remain vector/control-room focused.
