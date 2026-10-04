# Linear integration

Published documents become Linear projects and issues. A button on the document
menu (**Sync to Linear**) runs the sync. No manual ticket review happens before
creation.

## Mapping

| whydidwedothis                      | Linear                                  |
| ----------------------------------- | --------------------------------------- |
| WorkOS organization                 | Linear workspace (one per organization) |
| Project                             | Team (chosen once, remembered)          |
| Published document                  | Project                                 |
| Decision or requirement in document | Issue                                   |
| Sub-task of a decision/requirement  | Sub-issue                               |

An admin picks no team up front. The first sync of any document in a project asks
for an existing Linear team, validates it against Linear, and remembers it for
every later document in that project. Teams are never created automatically.

## Who can do what

- Only organization admins (WorkOS `admin` role) record or remove the
  organization's Linear connection in **Settings > Linear**.
- Any organization member can sync a published document. There are no per-project
  roles in this app, so "project editor" means any member.

## Sync behavior

1. The latest published version is read. Unpublished documents cannot sync.
2. A model (the existing planning model port, `AI_PROVIDER`) extracts decisions,
   requirements, and sub-tasks into a plan with stable keys. The plan is saved on
   the sync run. The model sees the keys of earlier runs so a reworded item keeps
   its key. Document text is treated as untrusted data.
3. The Linear project is created once per document, then renamed and re-described
   on later syncs.
4. Each item maps to an issue with a deterministic Linear ID derived from the
   document and item key. Linear accepts a client-chosen ID, so a repeated create
   can never duplicate an issue.

### Republishing

- Issues whose state is completed, canceled, or whose state name contains
  "review" are never changed.
- Other issues are updated only when the source text changed. Manual edits in
  Linear survive a sync when the source did not change.
- New requirements create new issues.
- Issues for requirements removed from the document are left as they are.

### Failure and retry

Progress is saved after every issue. A failure (rate limit, network, Linear
outage) marks the run failed with its message and the count completed. Syncing
again resumes the same run for the same version, skips finished items, and does
not call the model again. A new published version starts a new run. One run per
document can be active at a time (10 minute lease, then it is treated as
interrupted and can be retried).

The sync runs inside one request. Very large documents are bounded by Worker
subrequest limits, which surfaces as a failed run that a retry continues.

## Setup

WorkOS Pipes owns the Linear OAuth app, the consent screen, token storage, and
token refresh. This app stores no Linear token and needs no Linear environment
variables.

1. In the WorkOS dashboard, open Pipes and enable the **Linear** integration.
   Use your own Linear OAuth app credentials if WorkOS asks for them (create the
   app in Linear under Settings > API, and add the redirect URI WorkOS shows).
   Request the scopes `read`, `write`, and `issues:create`.
2. Apply migration `0017_linear_integration.sql` with the direct migration
   workflow before deploying.
3. An organization admin opens **Settings > Linear**, connects Linear in the
   WorkOS widget, then clicks **Use my Linear connection**. That records the
   admin as the connection owner for the organization.

Every sync asks WorkOS for a fresh token for the owner's connection, scoped to the
organization first and then to the user. If the connection needs authorizing again,
lacks a scope, or was removed, the sync stops before it starts and tells an admin
to reconnect. Nothing is half-created.

### Attribution

Pipes tokens act as the Linear user who connected, so issues are created as that
admin's Linear account. For a neutral creator, connect from a dedicated account such
as "whydidwedothis". A free Linear workspace needs no paid seat for it, which you
should confirm in your billing settings. The widget is limited to OAuth, because
the sync sends the token as a Bearer token.

### Leaving

**Stop using this connection** removes the organization's link and keeps every
project and issue link. Disconnecting Linear itself happens in the Pipes widget.
Connecting a different Linear workspace clears the stored team, project, and issue
links for the organization.
