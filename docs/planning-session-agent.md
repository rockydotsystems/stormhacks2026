# Planning session agent: new project flow

**Status:** first draft. Builds on the [product plan](hackathon-product-plan.md) and [technical specification](hackathon-technical-spec.md). It narrows the "create the plan" and "start a planning session" steps, and adds voice, a requirements skill, and a swappable AI provider. Items marked **TODO** or **Open** are not decided.

## Purpose

A user starts a project by pitching their idea to an agent. The agent turns the pitch into the first draft of the planning document. It asks about anything that matters and was not said, and it does not assume.

The user never edits the document directly. All changes come from the conversation.

## First-start flow

1. **New project.** The user presses "new project" and supplies minimal metadata (name, linked repository). The workspace opens with the agent chat on the left and the document on the right.
2. **Pitch.** The user spit-balls the idea, by text or by voice. There is no required format.
3. **Sufficiency check.** The agent compares what it has heard against the [planning skill](#planning-skill) and decides which path applies.
   - **Enough information.** The pitch covers what the skill requires. The agent writes the first draft and finalizes it.
   - **Gaps.** The pitch leaves out information, or a design decision has more than one reasonable answer. The agent asks the user directly. It may attach a suggestion to a question, so the user can accept it or answer differently.
4. **Gap loop.** The agent keeps asking about missing items until the skill is satisfied or the user says to continue with what exists.
5. **Draft.** The agent writes the document. Anything the user did not decide stays recorded as an open decision. The agent does not invent an answer for it.

Most pitches will land on the gaps path, so the grilling is the main experience.

### Rules for the agent

- **Do not assume.** Where a decision has several reasonable answers, ask. A suggestion is allowed. A silent choice is not.
- **Respect "that is enough".** If the user declines to answer more, proceed with the information given and record the remainder as open decisions.
- **Document updates are live.** The document fills in during the conversation, not only at the end.
- **Changes go through the existing proposal path.** The technical spec already defines proposals, human acceptance, and stable blocks. This flow reuses them.

**Open:** the product plan requires human acceptance of proposed wording. If the first draft is written in one pass, does the user accept it block by block, or as a whole draft? Block by block matches the spec. A whole-draft accept may suit this flow better.

## Planning skill

A skill is a document the agent reads to know what it needs before it can write the plan. It is the checklist behind the sufficiency check.

- **Content.** A list of required topics, each with a short description and what counts as "covered". Starting point, taken from the product plan: pain, users, goals, scope, requirements, constraints, tradeoffs, stack, dependencies, risks, failure cases, and unresolved choices.
- **Adaptive.** The needed items depend on what is being built. The skill defines a core set and lets the agent add or drop items based on the project. **TODO:** decide how far the skill goes toward project-specific items.
- **Output.** For each item the agent records covered, partial, or missing, with the part of the conversation that supports it. The result is structured data, so the UI can later show progress, and so the check can be tested.
- **Storage.** A versioned file in the repository, loaded as agent context. Record the skill version on each run, so a draft can be traced to the checklist that produced it.

**Relation to readiness review.** The skill drives the early conversation: do we know enough to write? The readiness review in the product plan happens before binding: is the written plan complete and consistent? They may share a checklist. Both stay advisory, and neither approves anything.

## Conversation modes

There is one conversation with two input modes. The transcript and the document are the same in both.

| Mode  | Input                   | Output                                   |
| ----- | ----------------------- | ---------------------------------------- |
| Text  | Typed message           | Streamed agent text                      |
| Voice | Spoken, then ElevenLabs | Spoken agent response, with a transcript |

### Voice loop

```text
User speaks
   |
   v
ElevenLabs: speech input, detects the end of the user's turn
   |   transcript
   v
Brain: planning session agent (OpenRouter, Gemini model)
   |   reply text, document proposals
   v
ElevenLabs: text to speech
   |
   v
User hears the reply
```

- **ElevenLabs** runs the speech loop. It handles speech input, finds conversational ends, and speaks the reply. Nothing between the user's speech and the agent's output belongs to the speech layer except orchestration.
- **The brain** is our planning session agent. It receives the finished user turn, runs the sufficiency check, drafts, and returns text.
- **Turn end.** The agent runs when the user finishes a turn, not on every partial word. The document updates after each run.

**Open:** how ElevenLabs reaches the brain. Two candidates:

1. ElevenLabs' agent product calls our backend as its language model, through a custom model endpoint.
2. The client uses ElevenLabs for speech input and output only, and our existing chat API is the brain.

Option 2 keeps one brain path for text and voice. Option 1 may reduce voice latency. Verify what ElevenLabs supports before choosing. Either option must work from a Cloudflare Worker and must never expose a server key to the browser.

**TODO:** the document visual design. The design system is being drafted. This doc does not specify how the document looks.

## AI provider abstraction

The provider must be swappable. The default is Gemini through OpenRouter. Changing to another model or provider must not change feature code.

### Requirements

- **One port, many adapters.** Feature code depends on a small model interface owned by this project. An adapter implements it for one provider.
- **Default adapter.** OpenRouter, with a Gemini model.
- **Config selects the model.** Model ID, provider choice, and keys come from environment configuration. Changing the model ID is a config change. Changing the provider is a registration change.
- **No SDK types escape the adapter.** Provider messages, response objects, and errors stay inside it. This matches the technical spec.
- **Tests use a fake adapter.** CI does not call paid models.

### Fit with the existing DI

The repository already composes services with Awilix in `src/server/container.ts`, with explicit registrations and strict lifetimes. Extend that, do not replace it.

- Define the port, for example generate and stream with structured output and tool calls, in the planning feature module.
- Register the chosen adapter by name in the container. The agent service depends on the port, never on a concrete adapter.
- The adapter holds no request or user state, so it can live longer than a request. Do not capture request identity in it.
- Keys are server-only and live in `.dev.vars` locally.
- The speech layer follows the same pattern, with its own small port and an ElevenLabs adapter. **Open:** whether a speech port is needed in the MVP, or whether ElevenLabs is wired directly.

**Reconcile with the technical spec.** The spec recommends the Vercel AI SDK behind a model adapter. This is compatible. The AI SDK can be the implementation inside the OpenRouter adapter, and the port stays ours. Confirm package compatibility with vinext and Workers before adopting it.

## Later: Slack and Teams meeting integration

The idea: an agent joins team meetings, because technical discussion happens there, and feeds what it hears into the project document.

- **Deferred.** The product plan already defers broader chat integrations. Nothing in the first slice depends on this.
- **Reuse.** If built, meeting content becomes another input to the same planning session agent and the same proposal path. It must not write to the document directly.
- **Open:** which platform first, how audio or transcripts are captured, which document a meeting is attached to, and whether the agent only proposes updates or also speaks in the meeting.

## Open questions

- First draft: block-by-block acceptance or whole-draft acceptance?
- Planning skill: how project-specific should the checklist be?
- ElevenLabs: custom model endpoint, or speech only with our own loop?
- Is a speech port needed for the MVP?
- Document visual: waiting on the design system.
- Meeting integration: scope and order, after the main loop works.
