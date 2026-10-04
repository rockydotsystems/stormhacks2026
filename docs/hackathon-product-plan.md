# Hackathon product plan: engineering intent, kept intact

## Core pain

Engineering intent gets lost between plans, architecture decision records (ADRs), tickets, code, and PR review. A plan leaves a question unanswered; a human or coding agent fills the gap with a locally reasonable choice; the reviewer later discovers that the choice was never agreed upon. Larger teams pay for this through architectural drift, repeated explanations, slow reviews, and rework.

The problem is not that every implementation detail needs approval. It is that teams lack a shared, durable boundary between **decisions already made**, **decisions still open**, and **details left to the implementer**.

## Product promise

**Agree on intent together, make the agreement explicit, and see when implementation departs from it.**

The product is a collaborative system of record for engineering intent. It helps a team improve a plan before work begins, then carries that agreement into real GitHub review. It is a reasoning and review aid, not an autonomous architecture authority or a replacement for human reviewers.

A successful first experience answers three questions:

- What did we agree to build, and why?
- What consequential questions have we not answered?
- Does this PR honor the agreement, and what should we do if it does not?

## Target users

- **Primary:** technical leads and senior engineers responsible for a project plan or ADR and its implementation reviews.
- **Collaborators:** engineers and product partners who clarify requirements, challenge assumptions, and agree on tradeoffs.
- **Implementers:** engineers and coding agents that need a reliable source of approved intent rather than an incomplete ticket.

For the hackathon, focus on one engineering team, one project, one bound plan, and one linked PR. The longer-term need is strongest in larger teams; the demo does not need enterprise administration to make that need tangible.

## Primary workflow

1. **Set up a project and create the plan.** A project groups one or more repositories around a feature or initiative. A user names the plan, optionally describes it, and attaches it to that project. The plan inherits its repository context. The workspace starts with just the agent conversation; the blank document stays hidden until the agent begins drafting. Creating a document does not require writing the plan first.
2. **Start a planning session.** The conversational agent adaptively grills the user like a rigorous technical lead about pain, users, goals, scope, constraints, tradeoffs, dependencies, risks, failure cases, and unresolved choices. It follows the answers rather than a fixed questionnaire and progressively drafts stable document blocks while conversation continues. Challenge is part of creation, not a separate end-stage grilling agent. Proposed wording and suggested decisions require human acceptance.
3. **Refine together.** Once the plan is in good shape, the author requests reviewers. Reviewers join the original conversation alongside the author and agent, rather than opening a separate review thread. Users highlight precise text ranges and leave comments. The agent responds with proposals that replace whole stable blocks, or insert/delete blocks, rather than silently patching arbitrary text. Humans accept, reject, or request revision. Teammates can join, chat, comment, and review. Each proposal preserves the request, rationale, patch, author, and timestamp, with links back to its discussion. Substantive prose changes use this proposal path; minor direct operations may come later. The plan distinguishes hard requirements and architectural constraints from preferences, open decisions, and implementation freedom.
4. **Run a readiness review.** A lightweight completeness check identifies omissions and unresolved questions before binding. Users resolve them or explicitly record what remains open. This is not another planning session or an agent approval of the agreement.
5. **Bind a version.** A human deliberately binds an immutable snapshot as the agreement for implementation. Each document retains one mutable draft and immutable bound versions. Draft edits do not mutate the active enforced version; a new bind atomically becomes active. Binding is an explicit human action, not an automatic consequence of an agent finishing.
6. **Review a real GitHub PR.** Webhooks enqueue asynchronous review against the exact active bound version selected for that review. The reviewer agent posts explainable, evidence-based, non-blocking advisory findings with exact plan citations and relevant PR evidence. Initially, one repository explicitly maps to one binding document; the product does not guess among plans.
7. **Resolve and repeat.** The team revises implementation, amends and re-binds the plan, or acknowledges an intentional exception tied to the PR and version. If intent was missed or changed, users return to the workspace, start a new revision of the single draft, discuss the amendment, and bind it. Future reviews use the new active version; historical findings continue citing the version actually reviewed. The resolution records who chose it and why.

Future ticket integration follows the same intent loop: revise the ticket, amend the agreement, or record an exception. Linear is not required to demonstrate the first complete loop.

Use **planning session** for conversational creation/challenge, **readiness review** for pre-binding completeness, and **reviewer agent** for GitHub enforcement. The [technical specification](hackathon-technical-spec.md) describes the supporting boundaries and invariants.

## MVP scope

The MVP is one credible, end-to-end intent loop, not two disconnected mockups.

### Planning workspace

- Project-first onboarding and minimal document metadata creation, followed by a conversation that reveals a living block canvas as drafting begins.
- A Notion-like ordered document with stable block IDs, initially supporting headings, paragraphs, lists, and code blocks.
- A narrow collaborative path: teammate chat, text-range comments/highlights, whole-block agent proposals with accept/reject/revise, visible revision history, and discussion-to-change links. No CRDT or freeform multi-writer editing in MVP.
- Adaptive questions and proposed wording throughout creation, followed by a lightweight readiness review.
- Clear draft and bound states, one mutable draft, immutable bound versions, and an explicit amendment/re-binding path.

### GitHub advisory review

- A real GitHub connection receiving PR webhooks and asynchronously publishing/updating advisory review on GitHub. Manual re-review may supplement, but does not replace, webhook-driven review.
- An explicit repository-to-document association and a captured active bound version for each review; do not guess which agreement governs a repository.
- A concise review summary with high-signal findings, exact document citations, PR evidence, and suggested resolution choices.
- A visible resolution trail and a re-review showing the effect of a fix or approved amendment.

### MVP success bar

An observer can follow a decision from conversation to document change to bound agreement to conflicting code to cited finding to human resolution. The review catches a material conflict while leaving a harmless implementation choice alone. The team understands the finding without having to trust an unexplained agent verdict.

## Explicitly deferred

- Linear and other ticket integrations; broader chat, document, and repository integrations.
- CRDT multi-writer editing, substantive direct/freeform prose editing, sophisticated permissions, enterprise SSO policy, and multi-team governance. Coarse organization membership and roles are sufficient for MVP.
- Elaborate Notion block types/databases, beyond headings, paragraphs, lists, and code blocks.
- Semantic multi-document routing, automatic discovery of every relevant plan, cross-project dependency analysis, and repository-wide intent coverage.
- Autonomous code repair, autonomous plan approval, or automatic acceptance of exceptions.
- Mandatory merge gates, configurable blocking thresholds, and sophisticated severity policy. Longer-term configuration may support them; **the MVP is advisory only**.
- Policing every undocumented helper, library choice, variable name, or local implementation technique.
- Exhaustive correctness, security, or test review unrelated to the agreement. Existing reviewers and tools still own those jobs.

## Discrepancy taxonomy

These categories describe the relationship between implementation and intent, not simply how alarming a finding sounds.

| Category                                | Meaning                                                                                                                                   | Expected review behavior                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Direct contradiction**                | The PR conflicts with an explicit requirement or constraint in the bound plan.                                                            | Cite the conflicting passage and code; explain the impact and propose revision or an approved amendment/exception.              |
| **Missing planned requirement**         | A requirement expected in this PR's agreed scope is absent or incomplete.                                                                 | Cite the requirement and explain the coverage gap. Do not treat planned later work as missing from every incremental PR.        |
| **Undocumented architectural decision** | The PR makes a consequential choice the agreement does not authorize or delegate, such as changing a trust boundary or persistence model. | Identify the choice and why it needs team agreement. Silence in the plan is not, by itself, proof of a violation.               |
| **Scope expansion**                     | The PR adds material behavior or commitments beyond the agreed scope.                                                                     | Explain the added scope and its cost or risk; distinguish it from small supporting implementation work.                         |
| **Ambiguity / underspecification**      | The plan supports competing interpretations or lacks enough detail to judge a consequential choice.                                       | Ask a focused clarification question. Do not pretend the agent's preferred interpretation is binding.                           |
| **Compliant implementation detail**     | The choice is consistent with the agreement and falls within normal implementer discretion.                                               | No actionable finding. It may appear briefly in a review summary to demonstrate that discretion was respected.                  |
| **Potential plan amendment**            | Implementation reveals a credible reason to reconsider the agreement.                                                                     | Offer a proposed amendment for human decision; never treat the proposal as permission to depart from the current bound version. |

“Potential plan amendment” can accompany another category: a contradiction may be intentional and better than the original plan, but it remains a contradiction until the team resolves it.

## Advisory enforcement behavior

- **Advice, not a veto.** Findings do not block merging, grant approval, or claim that an unflagged PR is fully correct. Humans retain responsibility for the agreement and the merge decision.
- **Evidence before assertion.** Show the bound version, exact quoted passage, relevant PR evidence, and reasoning. If context is unavailable or a requirement cannot be verified from the PR, say so rather than asserting noncompliance.
- **Review the agreed slice of work.** Account for the linked PR's scope and staged delivery. A single PR need not satisfy an entire project plan.
- **Spend attention on consequential choices.** Prefer a few strong findings over a wall of speculative objections. Undocumented does not mean forbidden; ordinary implementation details are not architectural drift.
- **Expose uncertainty.** Separate explicit conflicts from questions and suggested amendments. The planning session should reduce ambiguity, and the readiness review should identify remaining gaps before binding; GitHub review should surface ambiguity that remains.
- **Keep resolution human and traceable.** Revising the PR preserves the agreement. Amending and re-binding changes the agreement explicitly. An acknowledged exception records a scoped departure without rewriting the rule for everyone else.
- **Do not move the goalposts.** A review names the bound version it used. Draft edits do not retroactively change that review, and an amendment prompts an explicit re-review against the newly bound version.

## End-to-end demo story

**Scenario:** a team is building internal incident search. The technical lead wants faster incident discovery without sending confidential incident content outside the company's approved boundary.

1. **Create metadata and start in the conversation.** The lead names the incident-search plan and links its GitHub repository. In the planning session, the agent questions the user benefit, intended users, scope, and data handling while progressively proposing blocks. A teammate joins, chats, and highlights the proposed search-design text to ask where incident content will go.
2. **Make challenge earn its place.** The same planning-session agent asks whether external search or embedding providers may receive incident text, and what happens if indexing fails. The team resolves the privacy question and accepts a whole-block proposal linked to the discussion. It leaves nonessential search-tuning choices to the implementer.
3. **Review readiness and bind the agreement.** The lightweight readiness review identifies remaining omissions or open choices. The lead then binds version 1, including the exact constraint: “Incident text must remain inside company-managed infrastructure; external embedding APIs must not receive incident content.” The workspace distinguishes the active immutable agreement from its mutable draft.
4. **Introduce a locally reasonable conflict.** An implementer uses a convenient external embedding API to accelerate the search prototype. Open a real GitHub PR linked to version 1. Include a harmless local implementation choice, such as an internal helper organization, that the reviewer should leave alone.
5. **Show explainable advisory review.** The PR webhook queues review. On GitHub, the reviewer agent posts a direct-contradiction finding quoting the privacy constraint and pointing to the code that sends incident text externally. It names version 1, explains the consequence, and offers the three resolution paths. The PR remains mergeable; this is not a surprise gate.
6. **Close the loop.** For the main demo, revise the PR to use a company-managed alternative; its webhook triggers re-review. Show that the contradiction is resolved against the same bound version, with the discussion and resolution still visible. Briefly show that a legitimate change of direction could instead become a discussed draft amendment requiring human re-binding, or an intentional exception tied to this PR and version. After re-binding, future review cites version 2 without rewriting version 1 findings.

The closing message: **the product caught an unapproved decision, not a stylistic preference—and the team resolved it without losing the reason for the original agreement.**

## High-level build priorities

1. Establish metadata creation, the block canvas, discussion, proposal decisions, and immutable binding.
2. Make the planning session visibly improve a specific plan, with a lightweight readiness review before binding.
3. Complete the real webhook-driven GitHub review and human-resolution loop early enough to rehearse it.
4. Polish citations, state clarity, and the demo narrative before adding integrations or policy controls.

The hackathon tradeoff is deliberate: depth in one complete workflow beats breadth across many incomplete surfaces.
