# Workspace UI preview

Open `/` for the decision dashboard and `/workspace` for the interactive document
workspace prototype. The existing WorkOS and database-backed notes example is
still available at `/starter`.

## Included

- A collapsible sidebar with conversation history and search.
- A chat composer with Enter to send, Shift+Enter for a new line, and a stop action.
- Expandable sample agent activity.
- Read-only documents beside the chat on desktop, or full-width on smaller screens.
- Markdown document downloads.
- MCP provider selection, a custom HTTPS endpoint form, access review, and removal.

This is a frontend prototype. Conversations and connection entries are held in
memory and reset on reload. Replies are deterministic samples; no AI requests,
MCP calls, credential collection, or OAuth authorization take place. Real
permissions must come from the provider when the authorization flow is integrated.

## Manual checks

1. Switch conversations, search for a title, and clear a search with no matches.
2. Start a new conversation, send a message, stop a response, then send another.
3. Expand the sample activity and open its linked document. Download the Markdown.
4. Open Connections, select a provider or custom server, and review the endpoint.
   An HTTP endpoint must show an error; an HTTPS endpoint can be added as a preview.
5. Remove a preview connection. Close dialogs with Escape and navigate with Tab.
6. At mobile width, open navigation and a document. Close the document to return
   to chat. Verify that no horizontal scrolling is required.

Run `pnpm check` and `pnpm deploy:check` for source and Worker build checks. The
latter is a deployment dry run, not publication.

## Decision dashboard

`/` opens the WhyDidWeChooseThis.Tech dashboard. The original conversation and
document workspace is at `/workspace`, and authentication remains at `/starter`.

The three primary destinations are Overview, Projects, and Documents. Overview
shows commonly visited projects and recently viewed documents. Projects group
related decisions and associated repositories; Documents searches across all
projects. Project shortcuts and recent documents appear in the sidebar.

Projects have a name, description, and optional repository selections. A repository
can belong to multiple projects. New documents use a Coss project dropdown and
inherit repository context from the project; repository selection lives in
project creation. Reviewer requests are deferred until inside the document.
Projects are identified by UUID, so names do not determine ownership or document scope.

Status, Project, and repository selectors use Coss's inline chip multi-selection
combobox pattern. Selections within a filter combine with OR, and different filters
combine with AND. My reviews is disabled until review requests have a backend. Bound is a status. Clearing filters
inside a project retains its scope. The inset frame and header remain fixed while
its content scrolls.

The folder artwork is an original CSS interpretation inspired by
[Rare UI's folder component](https://www.rareui.com/components/foldercomponent).
It respects reduced motion. Coss Menu, Avatar, Badge, Select, and Combobox join
the existing Button, Input, Dialog, Label, and Textarea primitives.

Dashboard records come from authenticated `/api/dashboard` requests. Organizations,
projects, descriptions, repository associations, and documents persist in Postgres.
Repository entries are explicit `owner/name` associations, not GitHub installation
access or fetched repository contents. Project creation and repository links share
one transaction. Apply migration `0003_quiet_randall_flagg.sql` before running this UI.

Document details load `/api/documents/[id]`. Saving appends a complete snapshot;
binding publishes the saved snapshot as an immutable version. Published versions
remain readable after new drafts. The list shows Bound only when its latest snapshot
is the latest published version; otherwise it shows Draft. Reviewers are not invented.
Descriptions are excerpts of the latest document body. Recently viewed document IDs
are stored on the device, scoped by authenticated user and organization.

The organization switcher uses the backend's membership list. New organization
creation adds its creator as a member. The backend currently provisions memberships
locally; it does not sync them from WorkOS. The account menu uses real WorkOS identity
and links to `/settings/profile`, `/settings/security`, `/settings/preferences`, and
`/settings/team`. Team management still uses the authenticated WorkOS organization,
which is separate from the selected database organization.

Verify project creation with multiple repositories, its empty state, creating a
document with inherited repositories, combined document filters, and organization
isolation. At narrow widths, check navigation, dialog dismissal, and chip wrapping.
Run `pnpm check` and `pnpm deploy:check` before publication.
