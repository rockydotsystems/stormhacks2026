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
one transaction. Apply migrations through `0008_graceful_corsair.sql` before running this UI.

Organizations without projects see a primary Create your first project action in
Overview and Projects. Projects group one or more repositories around a feature
or initiative. Once a project exists, users create a named document with an
optional description and inherited repository context. The description is stored
as metadata, separately from the initially empty document body.

A new document opens into a full-width conversation. The agent asks about the
named plan immediately. The document canvas appears beside the conversation only
once an agent proposal has been accepted. Documents have no direct editing mode
or manual save action; accepting a proposal persists a snapshot immediately.
Failed updates leave the proposal available to retry. History and review actions
live below the document title, with breadcrumbs providing navigation. At narrow
widths, Conversation and Document buttons switch panels and View document opens
an accepted addition. The composer stays available and panels scroll independently.

Request review is available once the document has content. Users can enter multiple
reviewer emails and manage the local selection. This is a prototype: no invitations,
notifications, shared conversations, or approvals are sent or persisted. The review
dialog says so. Binding is offered after selecting reviewers and still requires
explicit confirmation; previously bound documents can be amended and rebound.
The preview does not assert that selected reviewers have agreed.

The conversation uses deterministic follow-up questions about goals, constraints,
and risks. Proposals organize the user's messages into draft sections. Chat and
reviewer selections reset when leaving the document. No model calls, durable
conversation, collaborative proposals, or readiness review are implemented here.
The original `/workspace` demo remains available as a reference.

Document details load `/api/documents/[id]`. Acceptance appends a complete snapshot;
binding publishes the saved snapshot as an immutable version. Published versions
remain readable after new drafts. The list shows Bound only when its latest snapshot
is the latest published version; otherwise it shows Draft. List descriptions use a
body excerpt once drafted, and fall back to the initial metadata description.
Recently viewed document IDs are stored on the device, scoped by authenticated
user and organization.

The organization switcher lists active WorkOS memberships. Creating an organization
creates it in WorkOS and adds the authenticated creator with the WorkOS default role.
Switching refreshes the AuthKit session and reloads the current page. The retained
team management implementation uses the same selected organization as project and document data. SSO/MFA
requirements return the user to hosted sign-in. All data operations verify active
WorkOS membership, so revoked or pending memberships cannot use stale local grants.

Postgres mirrors WorkOS IDs/names for foreign keys; it does not provision independent
organizations or memberships. The legacy membership table remains for historical
data and planning foreign keys only. Migration 0007 preserves existing UUID-owned data and immutable history.
Legacy organizations need a separately reviewed mapping to a WorkOS organization;
they are never adopted by matching names or automatically granted to WorkOS users.
The local development database had no legacy organization records at migration time.

The account menu uses real WorkOS identity and links to `/settings/profile`,
`/settings/security`, and `/settings/preferences`. Team settings is temporarily
hidden; direct visits to `/settings/team` redirect to `/settings/profile`. Configure the
`widgets:users-table:manage` permission on the appropriate administrator role in WorkOS.

Verify project creation with multiple repositories, its empty state, creating a
document with inherited repositories, combined document filters, and organization
isolation. At narrow widths, check navigation, dialog dismissal, and chip wrapping.
Run `pnpm check` and `pnpm deploy:check` before publication.
