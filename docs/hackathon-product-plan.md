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

1. **Draft together.** A planning workspace puts agent conversation on the left and a living document/canvas on the right. Users describe the project, ask questions, and refine the plan through direct edits, comments, and highlights. Agent-applied edits remain visible, with change history and links back to the discussion that motivated them.
2. **Grill the plan.** An adversarial agent challenges omissions, ambiguity, contradictions, unapproved assumptions, failure modes, and unresolved decisions. It asks consequential questions rather than generating a generic checklist. Suggested answers are proposals, not silently accepted decisions.
3. **Resolve or explicitly leave open.** Collaborators revise the document, record decisions, and identify remaining unknowns. The plan should distinguish hard requirements and architectural constraints from preferences and implementation freedom.
4. **Bind a version.** A human deliberately marks a specific version as the agreement for implementation. Binding is an explicit approval action, not an automatic consequence of an agent finishing. Subsequent edits create a draft amendment; they do not silently rewrite the bound agreement.
5. **Review a linked GitHub PR.** The review agent compares the PR with the bound version and posts explainable, non-blocking advisory findings on GitHub. Each actionable finding identifies the discrepancy, cites an exact plan passage and relevant PR evidence, and explains its consequence.
6. **Resolve the discrepancy.** The team revises the PR, amends and re-binds the plan, or acknowledges an intentional exception. The resolution records who chose it and why. A later review makes clear which bound version it used.

Future ticket integration follows the same intent loop: revise the ticket, amend the agreement, or record an exception. Linear is not required to demonstrate the first complete loop.

## MVP scope

The MVP is one credible, end-to-end intent loop, not two disconnected mockups.

### Planning workspace

- One project plan or ADR with a conversation beside a readable, editable living document.
- A narrow collaborative path: comments/highlights, agent-applied document edits, visible revision history, and discussion-to-change links. Collaboration need not mean production-grade simultaneous editing.
- A grilling pass with actionable questions and suggested amendments that the human can accept or reject.
- Clear draft and bound states, with a stable bound version and an explicit amendment/re-binding path.

### GitHub advisory review

- A real GitHub connection that can read a selected PR and post a real advisory review comment. A manually initiated review is sufficient for the hackathon.
- An explicit association between the PR and its bound plan; do not guess which agreement governs a repository.
- A concise review summary with high-signal findings, exact document citations, PR evidence, and suggested resolution choices.
- A visible resolution trail and a re-review showing the effect of a fix or approved amendment.

### MVP success bar

An observer can follow a decision from conversation to document change to bound agreement to conflicting code to cited finding to human resolution. The review catches a material conflict while leaving a harmless implementation choice alone. The team understands the finding without having to trust an unexplained agent verdict.

## Explicitly deferred

- Linear and other ticket integrations; broader chat, document, and repository integrations.
- Production-grade real-time co-editing, enterprise permissions, SSO, and multi-team governance.
- Automatic discovery of every relevant plan, cross-project dependency analysis, and repository-wide intent coverage.
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
- **Expose uncertainty.** Separate explicit conflicts from questions and suggested amendments. Grilling should reduce ambiguity before binding; review should surface any ambiguity that remains.
- **Keep resolution human and traceable.** Revising the PR preserves the agreement. Amending and re-binding changes the agreement explicitly. An acknowledged exception records a scoped departure without rewriting the rule for everyone else.
- **Do not move the goalposts.** A review names the bound version it used. Draft edits do not retroactively change that review, and an amendment prompts an explicit re-review against the newly bound version.

## End-to-end demo story

**Scenario:** a team is building internal incident search. The technical lead wants faster incident discovery without sending confidential incident content outside the company's approved boundary.

1. **Start with an incomplete plan.** In the workspace, the lead asks the agent to draft a lightweight incident-search ADR. The first draft explains the user benefit but leaves data handling vague. A teammate highlights the search-design section and asks where incident content will go.
2. **Make grilling earn its place.** The grilling agent asks whether external search or embedding providers may receive incident text, and what happens if indexing fails. The team resolves the privacy question and records a visible document edit linked to the discussion. It leaves nonessential search-tuning choices to the implementer.
3. **Bind the agreement.** The lead binds version 1, including the exact constraint: “Incident text must remain inside company-managed infrastructure; external embedding APIs must not receive incident content.” The workspace clearly shows that this is the approved version.
4. **Introduce a locally reasonable conflict.** An implementer uses a convenient external embedding API to accelerate the search prototype. Open a real GitHub PR linked to version 1. Include a harmless local implementation choice, such as an internal helper organization, that the reviewer should leave alone.
5. **Show explainable advisory review.** Trigger the integration. On GitHub, the review agent posts a direct-contradiction finding quoting the privacy constraint and pointing to the code that sends incident text externally. It explains the consequence and offers the three resolution paths. The PR remains mergeable; this is not a surprise gate.
6. **Close the loop.** For the main demo, revise the PR to use a company-managed alternative and re-run review. Show that the contradiction is resolved against the same bound version, with the discussion and resolution still visible. Briefly show that a legitimate change of direction could instead become a draft amendment requiring human re-binding, or a documented intentional exception.

The closing message: **the product caught an unapproved decision, not a stylistic preference—and the team resolved it without losing the reason for the original agreement.**

## High-level build priorities

1. Establish the document, discussion, and bound-version experience.
2. Make grilling visibly improve a specific plan rather than merely produce commentary.
3. Complete the real GitHub review and human-resolution loop early enough to rehearse it.
4. Polish citations, state clarity, and the demo narrative before adding integrations or policy controls.

The hackathon tradeoff is deliberate: depth in one complete workflow beats breadth across many incomplete surfaces.
