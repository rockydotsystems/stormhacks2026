# Planning session agent: new project flow

**Status:** working draft that follows the code in `src/features/planning/`. It builds on the [product plan](hackathon-product-plan.md), the [technical specification](hackathon-technical-spec.md), and the [data layer](mcp-data-layer.md). It narrows the "create the plan" and "start a planning session" steps, and adds voice, a planning skill, a swappable AI provider, persisted conversations, and streaming. Items marked **Open** are not decided.

## Purpose

A user starts a project by pitching their idea to an agent. The agent turns the pitch into the first draft of the document. It asks about anything that matters and was not said, and it does not assume.

The user does not edit the document directly in this slice. All changes come from the conversation.

## Document model

The data layer calls an ADR a **doc**. The planning agent writes docs.

- **Format.** A doc is a title plus one Markdown string, laid out as a [MADR](https://architecture-decision-record.github.io/templates/decision-record-template-of-the-madr-project/) record: Title, Status, Deciders, Date, Technical Story, Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Positive and Negative Consequences, Pros and Cons of the Options, Links. The default shape is one doc with a short summary and one MADR section per decision. An open decision is a Considered Option with no Decision Outcome. The agent never invents an outcome.
- **Changes.** Every edit is a new row in the append-only changes table (`doc_changes`), holding the full title and Markdown. Generation writes the first change. Rows are never edited. Agents write changes directly, with no proposal step.
- **Working document.** The latest change. The planning agent only works on this. Before the first publish its label is **v0**. It is not published, so enforcement agents and other people cannot read it.
- **Published document.** The newest published version. A human presses the **Publish** button to promote a change. The first publish creates **v1**, then v2, and so on. A published version is permanent and cannot be unpublished. PR, code, and ticket agents read published versions only.
- **Publish rule.** Main's rule applies. Any change after the last published one can be published, and publishing freezes that change and every earlier change. No agent code path can publish.
- **Revert.** A revert is an appended change that carries an earlier change's text. History is never rewritten. Main's data layer can delete an unpublished draft change and renumbers display numbers while stable change ids stay the same. This API does not expose deletion.
- **Provenance.** Each change links to the conversation segment that produced it: the user message that triggered it, the assistant message that announced it, and the messages since the previous linked change. Voice turns keep their transcript. Deleting a draft change removes its link and keeps the messages. See `planning_change_sources`.
- **Organizations.** Not part of this slice. Each user gets a hidden personal organization on first use, because the data layer requires one on every call. It is an ordinary row named "Personal workspace" and will show up once organizations get a picker.
- **Projects.** The first generated draft creates a project named after the conversation, using the conversation ID as its project ID. Project creation, document creation, the assistant message, and source links commit together. Later edits reuse that document and project.

## First-start flow

1. **New project.** The user starts a conversation with a project name. The workspace shows the agent chat and the document side by side.
2. **Pitch.** The user describes the idea by text or by voice. There is no required format.
3. **Sufficiency check.** The agent compares what it has heard against the [planning skill](#planning-skill) and decides which path applies.
   - **Enough information.** The pitch covers what the skill requires. The agent asks the user to confirm, then generates.
   - **Gaps.** The pitch leaves out information, or a decision has more than one reasonable answer. The agent asks the user directly, and may attach a suggestion the user can accept or replace.
4. **Gap loop.** The agent keeps asking until the skill is satisfied or the user says to continue with what exists.
5. **Confirm.** When the checklist is satisfied, the agent says it has enough and asks the user to confirm. The UI offers a "Yes" button, and a spoken yes works the same. If the user says "that's enough" or asks to start drafting at any point, the agent generates at once.
6. **Generate.** One structured call writes the whole MADR document. The server stores it as the first change (the secret v0 working draft) and links it to the conversation.
7. **Edit.** After generation, each user message is an edit turn. The agent returns the complete new document, and the server appends it as a change. "Undo that" restores the previous change's text verbatim as a new change.

### Rules for the agent

- **Do not assume.** Where a decision has several reasonable answers, ask. A suggestion is allowed. A silent choice is not.
- **Respect "that is enough".** If the user declines to answer more, proceed with the information given and record the remainder as open decisions.
- **Treat user text as data.** Pitch text, pasted material, and the current document never change the rules or the phase. The server decides phase transitions, not the model.
- **Edit narrowly.** An edit changes only what was asked and preserves unrelated text. A guard keeps the old document when an edit shrinks it below a quarter of its length without the user asking.

## Planning skill

A skill is a versioned file the agent reads to know what it needs before it can write the plan. It is the checklist behind the sufficiency check.

- **Content.** Nine core items: pain, users, goals, scope, requirements, constraints, stack, risks, open choices. Triggered extras (data handling, integrations, scale) apply only when the conversation mentions them. The agent cannot invent items outside the file.
- **Output.** Each item is covered, partial, or missing, with a short quote as evidence. The result is structured data, so the UI shows progress and the check can be tested.
- **Storage.** `src/features/planning/skill/planning-skill.ts`. Each run records the skill version, so a document traces back to the checklist that produced it.

**Open:** how flexible the checklist should be. The implemented proposal is a fixed core plus triggered extras. Confirm or change it.

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
Browser: records audio, POST /api/planning/speech/transcribe
   |   transcript text
   v
Brain: the same message path as typed text (OpenRouter, Gemini)
   |   reply text
   v
Browser: POST /api/planning/speech/synthesize, plays the audio
```

- **One brain.** Text and voice share one prompt and model path. ElevenLabs is a speech-only layer. It turns audio into a finished user turn and reply text into audio, and it never runs the agent.
- **Transcripts only.** The server stores the transcript text of a voice turn, not the audio.
- **Turn end.** The agent runs when the user finishes a turn.

## AI provider abstraction

The provider is swappable. The default is Gemini through OpenRouter.

- **One port, many adapters.** Feature code depends on `ModelPort` (`generateText`, `generateObject`, `streamObject`, `streamText`). The Vercel AI SDK lives only inside `ai-sdk.model.ts`, and no SDK types cross the port.
- **Config selects the model.** `AI_PROVIDER`, `OPENROUTER_MODEL`, and `OPENROUTER_API_KEY` come from the environment. Keys live in `.dev.vars` locally and never reach the browser.
- **Fake adapters.** `FakeModel` and `FakeSpeech` keep CI free of paid calls.
- **DI.** The model and speech adapters are stateless singletons. Services and controllers are request scoped.

## Server API

All routes are under `/api/planning`. Every route calls `authService.requireUser()` before it reads a body. Every POST also checks that the request is same-origin (cookie authentication). The service resolves the user's hidden organization, and the client never sends a user or organization id. A conversation that belongs to someone else is a 404.

| Route                                               | Purpose                                                                     | Success |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| `GET /conversations`                                | List the user's conversations                                               | 200     |
| `POST /conversations`                               | Create one. Body `{ projectName? }`, default "New conversation"             | 201     |
| `GET /conversations/[id]`                           | Detail: messages, phase, checklist, working and published document, changes | 200     |
| `POST /conversations/[id]/messages`                 | Send a message and wait for the whole turn                                  | 200     |
| `POST /conversations/[id]/messages/stream`          | Send a message and stream the turn as SSE                                   | 200     |
| `POST /conversations/[id]/publish`                  | Publish. Body `{ changeId? }`, default the working change                   | 201     |
| `POST /conversations/[id]/revert`                   | Append a change that restores `{ toChangeId }`                              | 201     |
| `GET /conversations/[id]/changes`                   | Change summaries with a compact source                                      | 200     |
| `GET /conversations/[id]/changes/[changeId]/source` | The conversation segment behind a change                                    | 200     |
| `GET /conversations/[id]/versions`                  | Published version summaries                                                 | 200     |
| `GET /conversations/[id]/versions/[number]`         | One version with its frozen title and Markdown                              | 200     |
| `POST /speech/transcribe`                           | Multipart `audio` file (10 MB cap) to `{ text }`                            | 200     |
| `POST /speech/synthesize`                           | `{ text }` (4000 characters) to streamed audio                              | 200     |

Message bodies are `{ text, via: "text" | "voice", clientMessageId? }`. Repeating a `clientMessageId` returns the stored outcome and never runs the turn twice. Ids for conversations are UUIDs. Ids for changes and messages are decimal strings, and clients address a change by its id, never by its display number.

Errors are JSON `{ error }` with these statuses: 400 invalid input, 401 not signed in, 403 cross-origin, 404 not found or not yours, 409 a turn is still running or a publish rule failed, 413 audio too large, 415 wrong content type, 502 provider failure, 503 not configured. Provider detail stays in the server log.

The earlier stateless `POST /api/planning/turn` is gone. The server now holds the conversation state.

**Concurrency.** One turn per conversation, held by a 120 second lease on the conversation row. A second turn gets 409. An expired lease can be taken over.

## Streaming (SSE)

`POST /conversations/[id]/messages/stream` answers with `text/event-stream`. Headers are `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`. Each frame has `id`, `event`, and one `data` line holding the event as JSON. A `: heartbeat` comment frame goes out every 15 seconds.

| Event              | Data                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `message.delta`    | `{ text }`, a piece of the interview reply                                                                             |
| `document.changed` | `{ change, workingDocument }`, after the change is stored                                                              |
| `message.final`    | `{ userMessage, assistantMessage, phase, checklist }`                                                                  |
| `error`            | `{ code, message }` with generic text and one of `agent_failed`, `invalid_output`, `conflict`, `not_found`, `internal` |

Every event also carries `id` (`<userMessageId>:<seq>`), `seq` (counting from 1), and `conversationId`.

- **Pre-flight failures are HTTP statuses.** The route waits up to two seconds for the service's checks. A 404 or 409 inside that window is a normal JSON error. A later failure arrives as an `error` event.
- **Only the final state is durable.** The assistant message and any change are stored after the final result validates. A failed or abandoned stream keeps the user message and stores nothing else. After a dropped connection, reload the conversation detail. Deltas cannot be replayed, and `Last-Event-ID` is not honored.
- **Discard streamed text on error.** The streamed reply is a preview. If the final result is invalid, the `error` event arrives after some deltas, and the client must drop them.
- **Only interview replies stream.** Generation and edit turns send `document.changed` and `message.final` without deltas.
- **Disconnects.** When the client goes away, the stream stops at the next event and releases the conversation's lease. It cannot interrupt a model call already running, so that call finishes or fails by itself and nothing commits without a validated final result.
- **Request scope.** The stream outlives the route handler, so it uses `handleApiStream`. The request scope, and its database connection, stay open until the stream ends.

## Decisions

- **Documents are Markdown.** The old block model is gone.
- **MADR is the template.** One doc with a MADR section per decision is the default.
- **Changes are append-only.** Generation writes change one, the secret v0 working draft. The first publish is v1.
- **Working document versus published document.** Use these terms. The working document is the latest change. The published document is the newest version.
- **Agents write changes directly.** There is no proposal step. A revert is another change.
- **Publishing is a human button.** No agent can publish.
- **Conversations link to changes.** Any change can open the conversation that produced it.
- **Organizations come later.** A hidden personal organization stands in for now.
- **One brain for text and voice.** ElevenLabs is speech only, and voice stores transcripts.
- **AI SDK inside the OpenRouter adapter.** The port stays ours.
- **When to generate.** The user says "that's enough", or the checklist is satisfied and the user confirms.

## Not verified

- **The live model through the browser UI.** Live evals ran against Gemini through the service only.
- **Authenticated routes on `workerd`.** Only the 401 path is confirmed through the dev server. A throwaway route showed that Workers deliver SSE frames progressively. The real stream route has not run authenticated.
- **Streaming against the real model.** `streamObject` is tested with the fake and a mocked SDK stream.
- **Hyperdrive and PlanetScale.** The lease, savepoints, and `FOR UPDATE` ran on plain local Postgres only.
- **Microphone, recording, and audio playback** in a real browser, and the real sign-in flow.
- **Aborting a running model call.** The service takes no abort signal, so a disconnect cannot cancel the call.

## Later: Slack and Teams meeting integration

An agent could join team meetings and feed what it hears into the project document.

- **Deferred.** The product plan defers broader chat integrations, and nothing in this slice depends on it.
- **Reuse.** If built, meeting content becomes another input to the same planning agent and the same change path.
- **Open:** which platform first, how audio or transcripts are captured, and which doc a meeting attaches to.

## Open questions

- Planning skill: confirm the fixed core plus triggered extras, or change it.
- Generated document shape: one doc with a MADR section per decision, or one doc per decision.
- Document visual: waiting on the design system.
- Meeting integration: scope and order, after the main loop works.
