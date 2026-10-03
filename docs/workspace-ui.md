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

`/` now opens the WhyDidWeChooseThis.Tech dashboard. The original conversation
and document prototype is at `/workspace`; document details link to it explicitly
as a separate prototype.

The dashboard includes organization switching, recent document history,
collections, requested reviews, bound decisions, search, combined status and
collection filters, sorting, reviewer avatars, and a new draft form. These use
sample data held in memory, including newly created drafts. Reloading resets
changes. Account authentication remains at `/starter`; the dashboard profile and
organizations are illustrative and do not represent authenticated memberships.

The folder collection artwork is an original CSS interpretation inspired by
[Rare UI's folder component](https://www.rareui.com/components/foldercomponent).
It uses no additional animation dependency and respects reduced motion.
Coss Menu, Avatar, and Badge join the existing Button, Input, Dialog, Label,
and Textarea primitives.

Check the dashboard by switching organizations, combining filters, searching for
an absent title and clearing it, opening documents, inspecting the recently
viewed list, and creating a draft with reviewers. At narrow widths, open the
navigation dialog and verify its keyboard dismissal. Run `pnpm check` and
`pnpm deploy:check` before publication.
