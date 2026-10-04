# Hackathon technical specification: engineering intent lifecycle

This specification supports the [product plan](hackathon-product-plan.md). It defines enough structure to build one complete hackathon loop: create metadata, conversationally draft, refine collaboratively, review readiness, bind, receive a real conflicting PR webhook, publish cited advisory findings, and resolve through implementation revision or plan re-binding.

**Status:** the lifecycle and MVP constraints below are firm product decisions. Implementation recommendations are labeled; they are not claims that these capabilities already exist. Repository facts and primary tooling documentation were inspected on October 3, 2026.

## Existing foundation and missing capabilities

| Area              | Repository fact                                                                                                                                                                                                           | Implication                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Application       | `package.json`: vinext 1.0.1 / Vite 8, Next-compatible App Router, React 19.2.8, TypeScript, Tailwind 4, Node ≥22.12, pnpm 12.                                                                                            | Extend the existing app; consult vinext/Cloudflare documentation and relevant Next API guides.                                    |
| HTTP/client state | `README.md` and `src/server/http.ts`: thin route adapters, controllers/services, Zod contracts, React Query; application data uses HTTP APIs, not server actions.                                                         | Keep transactional commands on this path; add SSE subscriptions for delivery.                                                     |
| Persistence       | `src/server/db.ts`: Drizzle over request-scoped postgres-js clients; Hyperdrive owns the remote pool; `compose.yaml`: local Postgres 18.                                                                                  | Postgres remains authoritative. Add feature schemas and committed Drizzle migrations; never reuse Worker sockets across requests. |
| Authentication    | WorkOS AuthKit proxy, login/callback/logout, and `AuthService.requireUser()`. Public session currently contains user identity only.                                                                                       | Organization context, membership, and coarse roles still need implementation. Authentication alone is not tenant authorization.   |
| DI                | `src/server/container.ts`: explicit Awilix 13 registrations, PROXY mode, strict lifetimes; controllers, services, and DB clients are scoped and disposed.                                                                 | Extend existing composition rather than replace it. No request identity or database sockets in singletons.                        |
| Product features  | Auth and user-owned example notes only. No plan blocks, agents, GitHub adapter, MCP server, SSE, or durable queue.                                                                                                        | Everything described below is new product work, not an existing service to configure.                                             |
| Deployment        | `vite.config.ts` and `wrangler.jsonc` target Cloudflare Workers with assets, Node compatibility, observability, and Hyperdrive. Account resources/secrets still need configuration; no durable jobs runtime is installed. | Workers is the selected app host. Durable runs need a compatible managed execution service, not an in-process Node queue.         |

No starter setup changes are required by this document. Keep the feature-first structure and existing test/format commands.

## Architecture and ownership

```text
Browser: chat/agent workspace (left) + living block canvas (right)
    | HTTP commands / queries               ^ SSE notifications / tokens
    v                                       |
vinext routes on Workers -> authenticated controllers -> workspace services
    |                                              |
    +------------------ Postgres ------------------+
                         ^       ^
                         |       |
                durable job worker -> agent orchestration -> model adapter
                         |                 |
GitHub -> webhook inbox -+                 +-> shared intent/decision engine
                         |
                         +-> GitHub evidence / advisory publishing adapter

Local agents -> authenticated narrow MCP adapter -> same domain services
```

Keep five ownership boundaries, not five independently deployed services:

- **Collaborative workspace:** project metadata, draft blocks/order, chat, text-range comments, proposal decisions, readiness records, binding, and human resolutions. Owns all mutation and version invariants.
- **Agent orchestration:** role-specific prompts/tool permissions, run context, bounded model loops, progress, durable execution, and proposal creation. Does not own permission to accept or bind.
- **Shared intent/decision engine:** retrieves relevant constraints, distinguishes requirements/open decisions/discretion, evaluates evidence using the shared taxonomy, and validates citations. Planning, readiness, GitHub, and MCP reuse it. Start with bound-block retrieval and ordinary code, not a separate graph or vector platform.
- **GitHub integration:** installations, explicit repository mapping, verified webhook intake, revision-pinned evidence, and advisory publication. Delegates intent reasoning; owns GitHub IDs, rate limits, and changed-line mapping.
- **MCP interface:** a thin authenticated adapter for local agents to read/search/evaluate/propose. No separate source of truth or bypass of workspace services.

**Recommendation:** place these responsibilities in feature-owned modules following `src/features/notes`, with server-only services and client-safe Zod/DTO contracts. Keep retrieval, classification, and citation policy independent of a model SDK. Do not build a generic agent platform for this demo.

### Internal ports and Awilix

Use small interfaces where external behavior must be swapped or tested: model generation/streaming, persistence transactions, durable job dispatch, GitHub evidence/publication, and activity delivery. Services can continue using the injected Drizzle DB where a separate repository wrapper adds no value. Pure block operations, taxonomy rules, and citation validators should be ordinary functions, not container registrations.

Register external adapters and coordinating services explicitly in the current Awilix container. Preserve scoped controllers/services/database clients; Hyperdrive owns remote connection pooling. Create and dispose a fresh scope per job or durable execution step, with explicit trusted organization/run context; background workers cannot rely on an HTTP WorkOS cookie. A long-lived SSE subscription needs its own lifetime and cleanup, not a dependency captured after `handleApi` disposes its request scope. Inject only at real boundaries; do not inject every block or decision object.

## Core model and invariants

The following are conceptual records, not a mandated table-per-row design. Every tenant-owned record carries `organization_id`; foreign keys and queries must prevent cross-organization references, including jobs and GitHub installations/mappings. Use internal IDs plus external WorkOS/GitHub IDs where needed.

| Record                      | Minimum durable content                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project/document            | Organization, name, creator, linked repository ID, single draft ID, active bound-version ID (nullable before first bind).                                                                     |
| Repository link             | Organization, GitHub installation and numeric repository ID, document ID; unique explicit mapping for that repository. Renames do not change identity.                                        |
| Draft/block                 | Draft revision, base bound-version ID; ordered blocks with stable UUIDs, type, typed content, and block revision. Start with heading, paragraph, list, and code.                              |
| Message/comment             | Actor, timestamp, document/run links; comments include block ID, block revision, selected text snapshot, offsets, and surrounding-text anchors.                                               |
| Proposal                    | Request/message/comment reference, rationale, structured patch, proposing actor/agent role and initiating human, timestamp, base draft/block revisions, status, and human decision audit.     |
| Agent run/readiness review  | Role, actor, input draft revision, model/prompt version, status/attempts, messages/output, omissions/open questions, errors, and start/end timestamps.                                        |
| Bound version/binding event | Immutable ordered block snapshot, version number/hash, draft revision, binder, timestamp, readiness reference and acknowledged open questions; binding event records previous/new active IDs. |
| PR review/finding           | Repository/PR, head and base commit IDs, captured bound-version ID, job/status, evidence coverage, validated findings, model/prompt version, publication IDs and timestamps.                  |
| Resolution/exception        | Finding/review, PR and bound-version ID, human actor, rationale, chosen resolution and timestamp. Exception additionally names the precise accepted departure and scope.                      |
| Webhook/job/activity        | Verified delivery ID and relevant payload; deduplication key, job inputs, attempts, lease and retry state; ordered durable activity for replay.                                               |

Firm invariants:

1. A document has **one mutable draft and any number of immutable bound versions**. The active pointer references a version belonging to that same document and organization. Draft edits never affect active enforcement.
2. Binding locks/checks the expected draft revision, snapshots its ordered blocks, creates the binding event, and swaps the active pointer in one transaction. Concurrent bind/edit requests cannot produce a mixed snapshot. The human binds; no agent tool can do so.
3. The document starts blank and its canvas stays hidden until the agent begins drafting. The first view is the conversation. Initial drafting and subsequent substantive prose changes are proposals; acceptance atomically applies a validated patch. Minor direct operations are deferred, not an alternate prose editor for MVP.
4. Structured operations are `replaceBlock`, `insertBlock`, and `deleteBlock`. Replacement preserves the block ID and replaces its complete typed content. Insertion allocates a new ID and specifies an order anchor; deletion preserves historical references. An atomic multi-block patch is allowed; do not introduce arbitrary range mutation.
5. Acceptance checks the pending proposal and expected draft/block revisions, including insertion anchors. A stale proposal returns a conflict for regeneration/revision, never overwrites newer accepted work. Double acceptance has one effect. Reject/revise records history; revision creates a linked successor proposal rather than overwriting the old request/rationale/patch.
6. Comments reference a precise range in a particular block revision, not a mutable substring alone. Define offsets consistently (recommend UTF-16 offsets over the canonical plain-text projection used by browser selection). MVP selection can be within one block. After replacement, re-anchor only on an unambiguous match; otherwise show the original quote as stale. Never silently attach it to unrelated text or discard it on deletion.
7. A readiness review is tied to its input draft revision. Later edits make it stale. Its omissions and unresolved choices inform human binding, not automatic agent approval; record any deliberate acknowledgement of open questions.
8. A review captures the active bound version when admitted to the durable queue. Rebinding during execution cannot change its inputs. Historical findings and citations retain that version even when a newer one becomes active.
9. An exception is human-approved and scoped to a PR, bound version, and specific departure. It does not change the plan or automatically exempt other PRs/versions; new code must still be checked against its scope.

**Recommendation:** store current block rows plus an integer draft revision; store full ordered JSON snapshots for bound versions. Accepted proposal patches and decision/activity records provide a lightweight draft audit trail. Preserve enough block revision content to display old comments. Full event sourcing, live collaborative text merging, and a normalized Notion database model are unnecessary.

## Request and event flows

### Create, plan, and refine

1. Authenticated HTTP creation validates organization membership and minimal metadata. A project groups one or more repositories; a document has a name, optional description, and selected project, from which it inherits repository context. Creation saves an empty draft and verifies repository associations when GitHub installation access is available. The conversation opens first, with the document canvas hidden until drafting begins. No bind exists yet.
2. A chat/comment POST persists the human message and queues a planning-session run transactionally. Return a run ID; browser connection lifetime does not own the job.
3. The worker loads a bounded conversation and draft snapshot. The planning-session agent adapts its questions across pain, users, goals, scope, constraints, tradeoffs, dependencies, risks, failures, and choices; there is no fixed questionnaire. It proposes stable blocks progressively while the conversation continues.
4. Persist messages, run progress, and schema-validated proposals before notifying subscribers. Tokens render an in-progress preview; they do not mutate the document. Teammates see the same durable proposals/activity.
5. A human POST accepts/rejects/requests revision. Workspace services enforce revisions and ownership, commit the decision/patch/activity together, and notify clients. Revision queues a new proposal with the old proposal retained. Concurrent substantive edits serialize through revision checks, not CRDTs.

### Readiness, bind, and amend

1. Queue a readiness review for the current draft revision. Its separate prompt/tool policy reports omissions, contradictions, and unresolved questions; it may suggest proposals but cannot approve or bind.
2. A human bind command names the expected draft revision and current readiness result, with acknowledgement of remaining open items. The transaction creates the immutable version and makes it active. Recommend requiring a current readiness result, not requiring an agent's “pass.”
3. On amendment, retain the single draft, track its base bound version, and start a new draft revision from the latest agreement when needed. Discuss and accept proposals, run readiness again, then bind. Do not create parallel writable drafts in MVP or discard existing unbound work implicitly.
4. A binding event can enqueue explicit re-review of a selected open PR against the new version, even if its head commit is unchanged. The queue pins that new version; older results remain available.

### Representative interfaces

Use existing authenticated controller/service APIs; route names below are illustrative, not a commitment to a large endpoint framework:

- `POST /api/projects`: create metadata and empty draft; `GET /api/documents/:id`: draft, active version, pending proposals, and activity cursor.
- Document-scoped POSTs for messages, range comments, readiness runs, proposal decisions, binds, re-reviews, and human resolutions. Commands carry an idempotency key and expected revisions where they mutate state.
- `GET /api/documents/:id/events`: authorized SSE subscription with a replay cursor.
- `POST /api/github/webhooks`: signature-verified service intake, not browser-cookie authentication.
- Services receive trusted actor/organization context and typed commands, not a client-selected owner ID. Validate request DTOs and model/tool output with Zod; SDK message types stay inside adapters.

## Realtime: SSE delivery, transactional state

**Firm choice:** use Server-Sent Events for agent token chunks, run statuses, comments/activity, and proposal notifications. All document writes use transactional HTTP/database commands. No WebSockets or CRDTs are required by the current repository.

**Recommendation:** one authorized document event stream with typed envelopes such as `message.delta`, `run.status`, `comment.created`, `proposal.created`, `proposal.decided`, `draft.updated`, `version.bound`, and `review.updated`. Include document/run IDs, revision/sequence, and durable event IDs where applicable. React Query refetches or invalidates canonical state on committed changes; SSE is not a second store.

Commit durable activity in the same transaction as the mutation. A simple SSE handler can poll indexed activity rows initially; Postgres notifications may later reduce latency but are only wakeups, never the durable record. Use monotonically ordered per-document cursors, reconnect with `Last-Event-ID` or an initial cursor, and deduplicate received events. Load the initial snapshot and cursor consistently so events are not missed between fetch and subscribe. If replay history has expired, refetch the snapshot.

Token deltas may be transient or batched into run checkpoints; completed messages/proposals and terminal run state must persist. On reconnect, restore the checkpoint/completed message and resume statuses, not promise byte-perfect token replay. Keep heartbeats, disable proxy buffering/caching, close subscriptions on disconnect, and revalidate access on reconnect/expiry. Browser disconnect must not cancel a durable run unless the user explicitly requests cancellation. Verify streaming and timeout behavior on the selected host.

## Agent roles and framework assessment

| Role                   | Prompt responsibility                                                                               | Allowed actions                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning-session agent | Rigorous adaptive conversation and progressive drafting; distinguish decisions from open questions. | Read draft/conversation, search intent, ask questions, create proposals. No acceptance, binding, or GitHub publishing.                                                            |
| Readiness reviewer     | Lightweight pre-bind completeness and consistency; surface omissions and unresolved questions.      | Read pinned draft, emit readiness result and suggested proposals. No approval or binding.                                                                                         |
| GitHub reviewer agent  | Evaluate pinned code evidence against pinned bound intent, respecting staged scope and discretion.  | Read bound version/evidence, retrieve constraints, emit structured findings. Deterministic integration code validates and publishes; model has no unrestricted GitHub write tool. |

Share tools and the intent engine, not one unrestricted prompt. Store concise rationale and evidence rather than hidden model reasoning. Bound loop steps, tool calls, input sizes, execution time, and cost.

**Recommendation:** use Vercel AI SDK behind a model/agent adapter for provider access, streaming, schema-driven tools/output, and a bounded `ToolLoopAgent` or explicit `streamText`/generation loop. Current primary docs recommend `ToolLoopAgent` for ordinary tool loops and core functions for explicit structured workflows. The SDK UI data protocol uses SSE and can carry custom data parts. That is compatible with the realtime direction; SDK UI helpers are optional and do not replace the shared document activity stream or persistence contracts.

**Durability is separate:** an AI SDK tool loop is not itself a durable webhook queue. Vercel Workflow SDK and its durable agent integration offer retryable steps and resumable streams, but they are separate dependencies/runtime integration and are not present here. Do not choose them solely because the frontend is Next.js. If the team chooses a compatible hosted workflow runtime, evaluate deployment support and recovery behavior before adopting it behind the jobs port. Do not leak workflow directives, provider messages, or SDK classes into the workspace/version model.

Primary references inspected: [AI SDK agents](https://ai-sdk.dev/docs/agents/overview), [AI SDK stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol), and [Workflow SDK durable agents](https://useworkflow.dev/docs/ai). Select and pin compatible package versions at implementation time; no AI SDK or model provider is installed in this repository today.

## GitHub webhook and reviewer design

**Recommendation:** use a GitHub App with only the permissions needed to read PR metadata/content and write the chosen advisory surface. Verify installation access before linking a repository. One repository explicitly maps to one document; no semantic document routing.

1. **Receive:** verify the raw-body webhook signature, validate supported event/action and installation/repository IDs, deduplicate by GitHub delivery ID, and transactionally persist inbox/job records before returning success. Start with PR `opened`, `reopened`, `synchronize`, and `ready_for_review`; draft PRs can be skipped with a recorded reason. A retry after persistence failure must not be acknowledged as queued.
2. **Pin:** resolve the repository's explicit tenant-owned mapping and exact active bound version in the enqueue transaction. Record no-link/no-bound cases as skipped, not compliant. Resolve/persist the PR head/base commit IDs and agreed slice of work; do not read a moving draft or substitute a new binding on retry. A new bind/manual re-review creates a new review input.
3. **Gather:** fetch PR metadata, paginated changed files/diffs, and bounded relevant file context at the recorded commits. Verify the head is still applicable; an older revision's review cannot overwrite a newer revision's result. Mark truncated diffs, inaccessible files, missing context, and scope uncertainty explicitly. Never run submitted code.
4. **Retrieve/evaluate:** select relevant constraints from the pinned snapshot with stable block/version citations. Simple text/heading retrieval is enough for MVP, with the whole small plan available to avoid silently dropping critical constraints. Compare evidence using the shared taxonomy, not a freeform “approve/reject” verdict. Missing requirements need evidence that this PR's scope includes them; absent diff lines alone do not prove a requirement is missing.
5. **Validate:** check structured output, supported categories, exact quoted text against the pinned blocks, code evidence against fetched content/commit IDs, and whether changed-line positions are real. Invalid citations require bounded repair or a visibly failed/limited review, not invented evidence.
6. **Persist/publish:** save validated findings and publication intent, then publish/update the single advisory artifact for this PR revision. Reconcile ambiguous API outcomes before retrying publication. Persist returned external IDs. Inline annotations/comments are optional and require confident mapping to changed lines; otherwise use summary findings with file/commit evidence.

Use the product's seven categories unchanged: **direct contradiction**, **missing planned requirement**, **undocumented architectural decision**, **scope expansion**, **ambiguity/underspecification**, **compliant implementation detail**, and **potential plan amendment**. A potential amendment can accompany a conflict; it never authorizes it. Compliant details are not actionable findings.

Each actionable finding includes category, concise claim/rationale, uncertainty, bound-version/block ID and exact quote, PR/head/file evidence, applicable scope, and resolution options. The advisory summary names the reviewed head and bound version and states coverage limits. It cannot grant approval, request changes as a gate, or imply comprehensive correctness/security review.

**Recommended MVP publication:** one named GitHub Check Run per PR head revision, updated on retry or re-review. Keep it non-required in branch protection and use a neutral completed result regardless of discrepancies; describe findings in its summary. A rebind at the same head updates that artifact with the newly reviewed version, while Postgres preserves both reviews. A summary comment/review is an alternative if App permissions or demo UX favor it, but choose one surface rather than posting duplicate check/review/comment summaries. Never configure blocking checks for MVP.

## Durable jobs, reliability, and idempotency

**Firm requirement:** both agent runs and webhook reviews survive request termination and worker restarts, with retries and idempotency. Fire-and-forget promises inside routes and in-memory queues do not satisfy the lifecycle.

**Recommended hackathon default for the selected Workers host:** evaluate Cloudflare Workflows for durable multi-step agent runs and Queues for webhook intake/dispatch. These are implementation recommendations, not installed capabilities. Persist inputs and an outbox in the same Postgres transaction, then dispatch idempotently; a platform enqueue outside that transaction cannot silently become the source of truth. Do not run a supervised Node process or in-memory queue inside the app Worker.

Keep managed execution behind the jobs port. Confirm retries, step checkpoints, model SDK compatibility, and SSE delivery before the webhook slice; choose the smallest compatible system rather than adding competing queues. Workers `waitUntil` is bounded post-response work, not a durable job runtime. Vercel Workflow is not a selected deployment dependency.

- Use job leases/heartbeats and reclaim expired work; bounded exponential backoff with jitter, attempt limits, and a failed-job state/manual retry. Respect GitHub rate-limit retry hints. One serialized planning run per document is sufficient initially; stale output still needs revision checks.
- Deduplicate webhook deliveries separately from semantic review jobs. Suggested review key: organization + repository + PR + head/base commits + bound-version ID + reviewer-policy version. Repeated delivery is one logical evaluation; intentional rebind at the same head is a different evaluation. Explicit retry can resume the existing failed run.
- Deduplicate chat commands by client command ID, model-generated tool writes by run/step/tool-call key, proposal decisions by proposal ID/status, and binds by command ID. At-least-once execution must not duplicate messages, patches, or versions.
- Persist run inputs and completed step/output checkpoints. After a crash, retry/resume a bounded step without duplicating tools; use attempt IDs to replace abandoned token previews. Exact deterministic model replay is not required, but published output must come from one validated persisted result.
- Serialize/coalesce publication per PR/head artifact. Track external publication IDs and a stable correlation marker; after a timeout, look for the existing artifact before creating another. Prevent a superseded head or old-binding run from replacing the selected latest output. Do not promise distributed exactly-once delivery.
- Persist and expose queued/running/completed/failed/skipped/superseded states with correlation IDs. Log latency, attempts, coverage, model cost, and publication failures without tokens/secrets. A failed review is never a “no conflicts” result.

## MCP surface

MVP operations are narrow and use the same authorization and services:

- **Read:** get explicitly identified project/draft/bound version, decision context, review, or finding. Default enforcement context names the active immutable version; return its ID.
- **Search:** search a specified document/version for constraints and return exact block citations.
- **Evaluate:** compare supplied, labeled code/diff evidence against an explicit bound version; return structured advisory findings, not approval. Supplied evidence is untrusted and not automatically equivalent to a verified GitHub review.
- **Propose:** submit a rationale and structured draft patch with expected revisions. Return a pending proposal for a human to accept/reject/revise.

No `accept`, `bind`, bound-artifact mutation, unscoped database query, arbitrary shell, or unrestricted GitHub write tool. Enforce this in service authorization as well as the tool list. **Recommendation:** start with revocable, organization-scoped credentials issued by an authenticated authorized human; select the exact MCP transport/auth implementation later. Credentials should be stored hashed where possible, scoped to permitted documents/operations, and never accept tenant IDs as proof of access.

## Auth, tenancy, and security

- Extend WorkOS session handling to trusted selected organization and verified membership/role. Recommend two coarse roles: members collaborate and decide proposals; admins/owners manage repository links, bind, and acknowledge exceptions. No fine-grained policy engine for MVP. Check authorization on every command, query, SSE subscription, and MCP call, not just page navigation.
- Carry organization ownership through documents, blocks, versions, conversations, proposals, binding events, reviews/findings, exceptions, installations, jobs, and activity. Enforce same-tenant references with constraints and server checks. The starter notes' `ownerId` is not a sufficient tenancy model for these features.
- Treat chat, plan prose, PR descriptions, code, and model output as untrusted input. Separate role instructions from retrieved evidence; tools apply allowlists and trusted context. Prompt injection must not unlock binding, acceptance, other tenants, or secret access.
- Verify GitHub signatures on raw bytes using timing-safe comparison; limit payload size and supported events. Use short-lived installation tokens; keep App keys, WorkOS secrets, webhook secrets, MCP credentials, and model keys server-only and out of logs/client DTOs.
- Protect cookie-authenticated writes with same-origin/CSRF controls; do not put credentials in SSE URL query strings. Recheck membership before consequential actions and reject cross-tenant identifiers even if guessed.
- Render block/code content safely without executable HTML. Limit model context and remote fetches; fetch only authorized GitHub repositories rather than arbitrary user URLs. Do not execute PR code or allow repository content to choose tools.
- Agree on allowed model providers and disclosure of private plan/code data before using real repositories. Minimize stored payloads, redact secrets, and choose basic retention/deletion rules. Hackathon demo data can be synthetic; the incident-search story is not permission to send real confidential incidents externally.

## Testing and acceptance evidence

Use the current Vitest/Zod/Drizzle testing patterns and disposable Postgres integration tests; keep ordinary CI independent of paid model calls and GitHub credentials.

- **Domain/transactions:** stale proposal conflicts, double accept, deleted insertion anchor, replacement preserving ID, stale range after repeated text, Unicode offsets, and concurrent bind/edit. Prove snapshots contain one revision and old versions never change after draft edits/re-binding.
- **Tenancy/permissions:** two organizations with distinct documents/installations; forged nested IDs and SSE/MCP subscriptions must fail. Verify agent credentials cannot accept, bind, or acknowledge exceptions.
- **Shared evaluation:** fixed plan/evidence fixtures for each taxonomy category; contrast a true conflict with harmless helper organization, a requirement in this PR with later-stage work, and an ambiguity with an explicit prohibition. Validate quotes/commit evidence independently of generated output. Model quality can be smoke-tested separately on synthetic fixtures.
- **Reliability:** duplicate/out-of-order webhooks, rebind while a job runs, new head while old publication waits, crash after tool persistence, crash/timeout after GitHub success before local acknowledgement, lease expiry, rate limits, and terminal failure. Assert one logical patch/bind and one advisory artifact per PR revision, not just successful HTTP responses.
- **Realtime/UI:** two authenticated teammates see persisted chat, comments, proposals, and accepted changes; disconnect/reconnect recovers state without missing/duplicating activity. Render blank, progressively proposed, rejected/stale, bound, and amended states, including stale comments and readiness results.
- **Real demo:** create metadata and blank canvas; answer adaptive questions; accept blocks; teammate range-comment/refine; readiness review; bind v1; open a real conflicting PR; webhook publishes a cited non-blocking result; harmless implementation detail is left alone; revise PR and verify re-review. Then amend/re-bind v2 and re-review the same PR, proving historical v1 findings still cite v1. Show the exception alternative with explicit PR/version scope.

Run repository checks as features land (`pnpm check`, `pnpm build`, opt-in disposable DB tests). For these documentation-only changes, Markdown formatting, links/structure, lifecycle consistency, and `git diff --check` are sufficient; no application behavior is being claimed.

## MVP implementation slices

1. **Workspace foundation:** tenant context/coarse roles, metadata and explicit repository link, ordered blocks, left chat/right canvas, durable comments/proposals, and transactional accept/reject/revise. Exit: two members refine one draft without freeform text merging.
2. **Planning and readiness:** model adapter, durable worker/run records, SSE activity/tokens, adaptive planning-session prompt and progressive block proposals, separate readiness prompt. Exit: conversation produces accepted intent and records open choices, including reconnect/retry behavior.
3. **Binding:** immutable snapshots, atomic active pointer, binding audit, revision checks, amendment/re-binding. Exit: editing the draft cannot change v1; binding v2 changes only future review inputs.
4. **Real GitHub loop:** App/webhook verification, durable review jobs, pinned evidence/intent retrieval, taxonomy/output/citation validation, one advisory publication, and resolutions/exceptions. Obtain App access and settle worker hosting early; exit: conflicting real PR produces a cited finding and a revision resolves it.
5. **Local-agent bridge and rehearsal:** narrow MCP read/search/evaluate/propose using the same engine; run the end-to-end demo and failure checks, polish state/citation clarity. Do not add broader integrations before the loop works.

## Deferred and open decisions

Explicitly defer Linear, blocking checks, sophisticated permissions, CRDT multi-writer/freeform editing, elaborate Notion blocks/databases, semantic multi-document routing, autonomous acceptance/binding/repair, a vector/graph platform, and a generic workflow-builder UI.

No decision blocks using these documents. Before implementing the affected slices, settle these operational choices:

| Decision                       | Recommended default                                                                                                                                        | When needed                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Durable jobs on selected host  | Cloudflare Workers with managed Postgres/Hyperdrive is selected. Evaluate Workflows for durable multi-step runs and Queues only where dispatch needs them. | Before durable-run/webhook implementation; no durable execution package or binding is installed yet.  |
| Model/provider and SDK version | AI SDK adapter with bounded loops and validated output; approved provider using synthetic demo data first.                                                 | Before planning runs; confirm credentials, privacy, latency/cost, and package compatibility.          |
| GitHub App access/publication  | Selected-repository App, one neutral non-required Check Run per PR head; summary findings unless inline mapping is certain.                                | Before real PR review; requires credentials, installation, webhook URL, and permission configuration. |
| WorkOS organization policy     | Verified membership, members collaborate, admins/owners bind/link/acknowledge exceptions.                                                                  | Before shared workspace; roles/organization context do not yet exist in public session DTOs.          |
| Readiness policy               | Require a current review, allow a human to bind with recorded open-question acknowledgements.                                                              | Before binding UI; avoid treating model confidence as approval.                                       |
| MCP transport/credentials      | One supported authenticated transport with revocable tenant-scoped read/search/evaluate/propose grants.                                                    | Before local-agent integration; no silent acceptance/binding permissions.                             |

These are bounded implementation choices, not reasons to change the finalized lifecycle or delay document delivery.
