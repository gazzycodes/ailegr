# 3D Universe — AI-First Integration Plan (v1)

Date: 2025-08-27

Goal
- Marry conversational AI (chat/voice) with the 3D financial scene for explainable, visual answers.

Plan
- Docked chat and voice controls in `TransactionUniverse.tsx`.
- When user asks a question, camera animates to relevant objects (e.g., COGS arcs, revenue streams) and overlays quick facts.
- ACTIONS from AI trigger data fetches (reports/ledger) and highlight corresponding nodes/edges.

Phases
- v1: Embed chat/voice UI, basic focus/zoom helpers, highlight elements by semantic tags.
- v1.1: Path tracing (narrated walk-through of a metric), time-scrub to view trends historically.

Tech
- Use existing React Three Fiber scene.
- Expose imperative handlers for focusByTag(tag), flashNode(id), showOverlay(content) to AI dispatcher.

Notes
- Keep all styles theme-token based; avoid heavy effects that drop below 60fps.
