# Admin Panel — Development Notes

Purpose: Track scope, RBAC, endpoints, UI states, and milestones for the Admin panel. This file is our living spec and changelog for admin.

## Scope (MVP)
- Tenant Members Management (RBAC enforced)
  - List members (OWNER/ADMIN)
  - Add member (OWNER)
  - Change role (OWNER)
  - Remove member (OWNER, prevent removing last OWNER and self)
- Tenant Settings
  - Tenant name (display/edit OWNER)
  - Seed/Ensure COA (OWNER/ADMIN)
  - Scheduler toggle info (read-only; server setting via env)
- Usage & Health (read-only)
  - AI usage widget (existing `/api/ai/usage`)
  - Server health status (existing `/api/health`)

## RBAC
- OWNER: full access to members CRUD, role change, tenant settings
- ADMIN: list members, add/remove members when OWNER permits (initially restrict to OWNER for role changes and destructive actions)
- MEMBER: read-only roster (future), no settings

## Endpoints (already present)
- GET `/api/memberships` — list user’s tenants
- POST `/api/memberships/switch` — switch active tenant
- GET `/api/members` — list (OWNER/ADMIN)
- POST `/api/members` — add (OWNER)
- PUT `/api/members/:userId` — role (OWNER)
- DELETE `/api/members/:userId` — remove (OWNER, protected from last OWNER/self)
- POST `/api/setup/ensure-core-accounts` — ensure COA (OWNER/ADMIN)
- GET `/api/ai/usage` — AI quota
- GET `/api/health` — server health

## UI Structure
- Route: `/settings/admin` (tab within Settings)
- Tabs: Members | Tenant Settings | Usage
- Components:
  - MembersTable: list + actions; modals for add/change role/confirm remove
  - TenantSettingsCard: tenant name (display for now), COA ensure action
  - UsagePanel: AI usage and server health cards

## State & Data
- React Query keys:
  - `members:list` (tenant scoped)
  - `usage:ai`
  - `health`
- Invalidate `members:list` on every mutation

## Milestones
1. Members list (OWNER/ADMIN) + add (OWNER)
2. Role update (OWNER) + guard for last OWNER
3. Remove member (OWNER) + guard for last OWNER/self
4. Tenant settings: Ensure COA action (OWNER/ADMIN)
5. Usage (AI + health) panel
6. RBAC-sensitive rendering and toasts

## TODOs / Open Questions
- Invite flow vs direct userId input: for now accept `userId` text. Email invites will be added later once Stripe billing and SMTP are integrated.
- Admin vs Member visibility within Settings: hide admin tab entirely for MEMBER.
- Audit logs: later, when we add Observability.

## Changelog
- 2025-08-24: Initial MVP scope and plan drafted. Auth redirect added to app; metrics chart aligned to labels. Ready to scaffold UI.


