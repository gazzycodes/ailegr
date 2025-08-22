## Added (2025-08-21)
- Logout control in navigation: theme-aware button (expanded) and icon (collapsed); uses toast feedback and shallow redirect to `/login`.
- Reset Password UX: public `/reset-password` screen + Settings → Account Security (change password).
## UI V2 Roadmap

Purpose: elevate visual polish while staying 100% theme-token driven. No hardcoded values; all styles use tokens in `src/theme/tokens.ts` and theme variables from `src/theme/themes.ts`.

Guiding principles
- Mobile-first layouts; desktop is progressive enhancement
- 60fps only; avoid heavy shadows/filters; prefer CSS transforms/gradients
- Accessibility: visible focus rings, sufficient contrast, reduced-motion support
- Navbar structure remains as-is; we only refine colors, effects, and surfaces

Top priorities (in order)
1) Update default Light theme (base for all visuals)
2) Update Dark theme (contrast-first; glass legibility)
3) Component/UI refresh: dashboard, reports, customers, AI, modals
4) Landing page (marketing)
5) Auth UI (login/register/reset) — logic wires later
6) Pricing/subscription scaffold (Stripe later)

- Note (2025-08-21): Landing top nav hairlines removed; progress bar re‑enabled (artifact‑free). Collapse‑on‑scroll, halo, and magnetic hover retained. CTA band upgraded to asymmetric premium glass; keep effects token‑driven.

Phase 1 — Theme upgrades (Light first, then Dark)
- Token audit: ensure all colors use `rgb(var(--...))`; remove any direct hex/rgb literals
- Surfaces: add tiered glass surfaces (surface-1/2/3) via tokens: blur, opacity, border, glow (see tokens.glass and tokens.shadow.glow)
- Rings & focus: introduce `--ring-primary`, `--ring-danger`, `--ring-focus` with outline/focus utilities
- Gradients: define `--gradient-aurora-1/2` start/stop stops per theme; usable for background and headings
- Neutrals: re-balance neutral.* scales for Light (depth via shadow tokens) and Dark (raise contrast of text/borders)
- Deliverables
  - `src/theme/themes.ts`: update Light first, then Dark
  - `src/components/themed/ThemedGlassSurface.tsx`: elevation variants (1/2/3) and tinted borders
  - `src/theme/transitions.css`: focus ring and glow utilities

Acceptance
- No visual element uses hardcoded color/size; all from tokens
- Light theme home/dashboard passes contrast AA for body text and UI controls
- Dark theme modals/cards remain legible over busy backgrounds

Phase 2 — Dashboard refresh (mobile-first)
- Components to add
  - MetricCard (with mini sparkline) — uses financial.* tokens
  - ConicGauge — token-driven conic gradient for KPIs
  - SegmentedControl (1M/3M/6M/1Y)
  - AssistantRail — compact AI Insights list with category dots
  - Sticky bottom action bar on mobile (Add Expense/Revenue)
- Constraints: SVG-only sparklines, minimal DOM, theme-aware gridlines

Phase 3 — Landing page (marketing)
- Sections: Hero (glass CTA pair, animated globe), Proof row, Features tiles, Preview strip (screenshots), Pricing scaffold, FAQ (independent accordions), Footer
- Effects: soft aurora background using gradient tokens, subtle parallax only via transforms; no heavy images
- Remove duplicative content blocks; keep hero focused; use micro-demos to showcase AI instead of static text
- Add trust row, security band, structured data (FAQPage JSON‑LD) and OG/Twitter meta
 - Trust row and prompt strip may be omitted to keep hero focused; micro‑demos preferred

Phase 4 — Auth UI (UI-only first)
- Views: Login, Register, Reset Password using shared `AuthCard`
- Buttons: primary and ghost social buttons; keep copy minimal

Phase 5 — Reports/Customers polish
- Sticky headers, density toggle, zebra striping via neutral tokens, improved pills and empty states

Phase 6 — A11y + Perf QA
- prefers-reduced-motion, focus order, ARIA on tables/modals, tab traps; perf pass on heavy views

Component backlog (theme-aware)
- GlowButton, StatPill, ConicGauge, SegmentedControl, CardCarousel, FeatureTile, PricingTier

Work queue (execution order)
- [ ] Phase 1: Light theme upgrade (tokens, surfaces, rings, gradients)
- [ ] Phase 1: Dark theme upgrade (contrast, glass legibility, rings)
- [ ] ThemedGlassSurface v2 (elevation + tint)
- [ ] Dashboard: MetricCard + SegmentedControl + ConicGauge
- [ ] AssistantRail + mobile sticky actions
- [ ] Landing page: Hero/Features/Preview/Pricing/Footer
- [ ] Auth UI: Login/Register/Reset scaffolds
- [ ] Reports/Customers polish sweep
- [ ] A11y + Perf QA checklist

Non‑goals (for now)
- Actual authentication logic, session/state
- Stripe subscription flows — UI scaffold only

Notes for implementation
- Use `designTokens.colors.primary.*`, `financial.*`, `neutral.*`
- Use `glass.blur`, `glass.opacity`, `glass.border`, `shadow.glow`
- Use `animation.duration.*` and `animation.easing.*` for motion
- No inline color strings; prefer utility classes or CSS variables from themes

- Supabase Auth (initial): client/provider wired; register uses email verification with redirect back to /login; login navigates to /dashboard. Auth UIs upgraded with motion, token-driven focus rings, and success overlays. Dev HUD and chat hidden on public views.



## Dev parity checkpoint � 2025-08-22
- Backend switched dev to Postgres; tenancy bootstrap added.
- Next: auth-derived tenant, protect writes, chat persistence.
