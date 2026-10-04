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
start with that project's repositories selected; these can be adjusted for the
specific decision. Reviewer requests are deferred until inside the document.
Duplicate project names are rejected within the current organization.

Status, Project, and repository selectors use Coss's inline chip multi-selection
combobox pattern. Selections within a filter combine with OR, and different filters
combine with AND. My reviews is a filter, and Bound is a status. Clearing filters
inside a project retains its scope. The inset frame and header remain fixed while
its content scrolls.

The folder artwork is an original CSS interpretation inspired by
[Rare UI's folder component](https://www.rareui.com/components/foldercomponent).
It respects reduced motion. Coss Menu, Avatar, Badge, Select, and Combobox join
the existing Button, Input, Dialog, Label, and Textarea primitives.

Dashboard records and repository options are local sample data. Created projects
and documents reset on reload; repositories are not fetched from GitHub.
Organization switching and profile data do not represent authenticated memberships.

Verify project creation with multiple repositories, its empty state, creating a
document with inherited repositories, combined document filters, and organization
isolation. At narrow widths, check navigation, dialog dismissal, and chip wrapping.
Run `pnpm check` and `pnpm deploy:check` before publication.
