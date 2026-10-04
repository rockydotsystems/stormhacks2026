import postgres from "postgres";

const url = new URL(
  process.env.PRESENTATION_DATABASE_URL ||
    "postgres://stormhacks:stormhacks@127.0.0.1:5432/stormhacks",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  throw new Error("Presentation seeding requires a local database.");
}
const sql = postgres(url.toString(), { max: 1 });
const uuid = (number) =>
  `f26a0000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const ago = (hours) => new Date(Date.now() - hours * 3600000);
const projects = [
  [
    1,
    "Incident search",
    "Reliable, private search across incident reports and operational runbooks.",
  ],
  [
    2,
    "Developer platform",
    "Shared infrastructure for background jobs, live collaboration, and delivery.",
  ],
  [
    3,
    "Workspace security",
    "Clear tenancy boundaries and least-privilege access for every workspace.",
  ],
];
const documents = [
  {
    id: 101,
    project: 1,
    title: "Search architecture",
    published: true,
    description:
      "Keep incident content inside our infrastructure. PostgreSQL full-text search first; semantic retrieval behind an evaluation gate.",
    content: `## Problem and goals
Engineers need to find the right incident report during on-call, without knowing the original title or exact wording. Search should return useful context in under 300 ms for the first page.

## Agreed approach
Start with PostgreSQL full-text search over incident titles, summaries, and runbook references. Weight titles above body text and keep a deterministic recency tie-breaker.

## Data handling
Incident text, metadata, and embeddings must remain inside company-managed infrastructure. Do not send incident content to external model APIs or third-party indexing services.

## Scope and non-goals
- Index resolved incidents and published runbooks.
- Filter by service, severity, and date range.
- Respect the caller's workspace permissions before ranking results.
- Defer cross-workspace search and automated incident summaries.

## Evaluation and rollout
Evaluate semantic retrieval on a sanitized, locally stored benchmark before enabling it. Compare recall against full-text search, record latency, and review every new data boundary with the team.`,
    discussion: [
      [
        "Jamie Lee",
        "Do we need semantic search in the first release, or can full-text search cover the on-call workflow?",
      ],
      [
        "Matthew H.",
        "Full-text first. We can evaluate self-hosted embeddings after we have a relevance baseline.",
      ],
      [
        "Sarah Chen",
        "Agreed. I added the data boundary explicitly: incident content stays inside company-managed infrastructure.",
      ],
      [
        "Matthew H.",
        "That captures the constraint. Let's publish this version and use it for implementation review.",
      ],
    ],
  },
  {
    id: 102,
    project: 1,
    title: "Search pagination and ranking",
    published: false,
    description:
      "Stable cursors, explicit ranking weights, and predictable results while new incidents arrive.",
    content: `## Goal
Keep search results stable as incident reports change. A user should not see duplicate results while paging.

## Proposed design
Use an opaque cursor containing rank, updated timestamp, and document ID. Return 25 results per page. Apply authorization filters before pagination.

## Ranking
Weight incident titles at 4, summaries at 2, and body text at 1. Break equal scores by updated timestamp, then document ID.

## Open questions
- Should recently resolved incidents receive a time-decayed boost?
- How should we explain a match on an archived runbook?`,
  },
  {
    id: 103,
    project: 1,
    title: "Search failure and fallback policy",
    published: true,
    description:
      "Keep the search experience useful during index delays and partial service failures.",
    content: `## Operating principle
Search failures must not prevent engineers from opening incident reports or browsing service history.

## Fallback behavior
If ranking times out, show the most recently updated reports for the selected service. Label the fallback clearly and retain the user's filters.

## Index freshness
- Re-index an incident within 60 seconds of a published edit.
- Retry failed indexing jobs with bounded exponential backoff.
- Alert when the oldest pending update exceeds five minutes.

## Observability
Record request latency, fallback count, and indexing lag. Never include incident content in metrics or application logs.`,
  },
  {
    id: 104,
    project: 2,
    title: "Background job delivery",
    published: true,
    description:
      "At-least-once delivery with idempotent consumers, bounded retries, and explicit dead-letter handling.",
    content: `## Decision
Use at-least-once delivery. Every consumer must make duplicate processing safe before it is enabled in production.

## Consumer contract
Persist an idempotency key with the resulting state change in the same transaction. A redelivery returns the stored outcome instead of repeating the side effect.

## Retry policy
Retry transient failures up to five times with exponential backoff and jitter. Send exhausted jobs to a dead-letter queue with their job ID and error category.

## Non-goals
Exactly-once transport and automatic replay of dead-letter jobs are out of scope. A human chooses when to replay a failed job.`,
  },
  {
    id: 105,
    project: 2,
    title: "Live collaboration transport",
    published: false,
    description:
      "WebSocket presence and revision notifications; the database remains the source of truth.",
    content: `## Goal
Keep teammates aware of new messages and document versions without polling the full workspace.

## Architecture
Use one Durable Object per planning conversation. Broadcast message IDs and document change IDs, then fetch authorized content from the application API.

## Reconnection
Reconnect with exponential backoff. Re-fetch the latest conversation after every reconnect so missed notifications never cause missing history.

## Open decision
Should we expire presence after 30 or 60 seconds without a heartbeat? Measure reconnect behavior on unreliable mobile connections first.`,
  },
  {
    id: 106,
    project: 3,
    title: "Workspace tenancy boundaries",
    published: true,
    description:
      "Verify organization membership on every request and constrain document relationships within the tenant.",
    content: `## Decision
The identity provider is the authority for organization membership. The local membership table is a mirror for foreign keys, not an independent access grant.

## Data boundaries
Every project and document belongs to one organization. Composite foreign keys prevent a document from referencing a project in another organization.

## Request authorization
- Resolve the signed-in user from the session.
- Verify active membership for the requested organization.
- Return not found for resources outside that organization.
- Treat repository access and organization membership as separate checks.

## Auditability
Preserve the author and immutable snapshot identity for every published version. Deleting a document removes it from normal reads without destroying its history.`,
  },
  {
    id: 107,
    project: 3,
    title: "MCP token access policy",
    published: false,
    description:
      "Short-lived access tokens, explicit audience checks, and tenant-scoped tool calls.",
    content: `## Goal
Let engineers use planning tools from their coding environment without exposing another workspace's documents.

## Token validation
Validate issuer, audience, expiry, and authorized scopes on every request. Resolve organization membership independently of the token's display metadata.

## Scope
Read tools can retrieve published versions and working documents. Write tools require explicit write scopes and use the same tenant checks as the web application.

## Outstanding questions
Define the refresh policy and decide whether write access needs a shorter token lifetime.`,
  },
];

try {
  const result = await sql.begin(async (tx) => {
    const memberships = await tx`
      select m.organization_id, m.user_id, o.name
      from organization_members m join organizations o on o.id = m.organization_id
      where m.user_id not like 'presentation-%'
      ${process.env.PRESENTATION_ORGANIZATION_ID ? tx`and m.organization_id = ${process.env.PRESENTATION_ORGANIZATION_ID}` : tx``}
      order by o.created_at, m.user_id
    `;
    if (!memberships.length)
      throw new Error("Sign in and create a local workspace before seeding.");
    if (new Set(memberships.map((m) => m.organization_id)).size > 1) {
      throw new Error(
        "Set PRESENTATION_ORGANIZATION_ID to choose a workspace.",
      );
    }
    const { organization_id: org, user_id: actor, name } = memberships[0];
    const participants = [
      [actor, "Matthew H."],
      ["presentation-jamie", "Jamie Lee"],
      ["presentation-sarah", "Sarah Chen"],
    ];
    for (const [user] of participants)
      await tx`insert into users (id) values (${user}) on conflict do nothing`;
    for (const [id, title, description] of projects) {
      await tx`insert into projects (id, organization_id, name, description, created_at)
        values (${uuid(id)}, ${org}, ${title}, ${description}, ${ago(240)}) on conflict (id) do nothing`;
      const [project] =
        await tx`select organization_id from projects where id = ${uuid(id)}`;
      if (project.organization_id !== org)
        throw new Error(
          "Presentation IDs already belong to another workspace.",
        );
    }
    let inserted = 0;
    for (const [index, doc] of documents.entries()) {
      const created = ago(96 - index * 9);
      const rows =
        await tx`insert into docs (id, organization_id, project_id, title, description, created_at)
        values (${uuid(doc.id)}, ${org}, ${uuid(doc.project)}, ${doc.title}, ${doc.description}, ${created})
        on conflict (id) do nothing returning id`;
      if (!rows.length) continue;
      inserted++;
      const [change] =
        await tx`insert into doc_changes (doc_id, title, content, created_by, created_at)
        values (${uuid(doc.id)}, ${doc.title}, ${doc.content}, ${actor}, ${created}) returning id`;
      if (doc.published)
        await tx`insert into doc_versions (doc_id, change_id, published_by, published_at)
        values (${uuid(doc.id)}, ${change.id}, ${actor}, ${new Date(created.getTime() + 3600000)})`;
      if (doc.discussion) {
        const conversation = uuid(201);
        await tx`insert into planning_conversations (id, user_id, organization_id, doc_id, title, phase, checklist, created_at, updated_at)
          values (${conversation}, ${actor}, ${org}, ${uuid(doc.id)}, ${doc.title}, 'generated',
          ${tx.json(["pain", "users", "goals", "scope", "requirements", "constraints", "stack", "risks", "openChoices"].map((id) => ({ id, status: "covered", evidence: "Captured in the team's search architecture decision." })))}, ${created}, ${ago(2)})`;
        for (const [user, displayName] of participants)
          await tx`insert into planning_participants (conversation_id, user_id, display_name, joined_at)
          values (${conversation}, ${user}, ${displayName}, ${created})`;
        const [standby] =
          await tx`insert into planning_messages (conversation_id, role, content, kind, created_at)
          values (${conversation}, 'assistant', 'The plan is ready for team discussion. I will listen while you review the tradeoffs.', 'standby-start', ${created}) returning id`;
        await tx`update planning_conversations set mode = 'standby', standby_since_message_id = ${standby.id} where id = ${conversation}`;
        for (const [i, [author, content]] of doc.discussion.entries()) {
          const user = participants.find(
            ([, displayName]) => displayName === author,
          )[0];
          await tx`insert into planning_messages (conversation_id, role, author_user_id, content, created_at)
            values (${conversation}, 'user', ${user}, ${content}, ${ago(3 - i * 0.25)})`;
        }
      }
    }
    const [counts] =
      await tx`select count(*)::int as documents, count(*) filter (where exists (select 1 from doc_versions v where v.doc_id = d.id))::int as published from docs d where d.id in ${tx(documents.map((doc) => uuid(doc.id)))}`;
    return {
      workspace: name,
      inserted,
      ...counts,
      searchDocument: uuid(101),
      projects: projects.length,
    };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
