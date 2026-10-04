# whydidwechoosethis.tech — brand exploration

**Current direction:** see [enterprise-direction.md](enterprise-direction.md) and
the `*-v2.png` concepts. See the [production kit](production/README.md) for
finished assets, the usage-size board, and landing-page verification.
The playful direction below was rejected as tacky and
does not represent the desired brand. It remains only as exploration history.

Proposed direction: **The decision trail**.

The historical concepts below were generated with the built-in imagegen tool
before the v2 landing page was implemented.

## Positioning

A shared record of engineering intent, from the planning conversation to the
pull request. For technical leads and engineers who need to preserve agreed
constraints, tradeoffs, and the reasons behind them.

**Keep the why with the work.**

Make the plan together. Record the decisions. See where your pull requests
depart from what you agreed.

## Identity

The mark joins three paths into a question mark: choices, a shared decision,
and a reason that survives implementation. The stacked wordmark reads
“why did we / choose this?”; use the exact domain nearby where discovery matters.
Avoid the acronym as the primary public name.

Keep the voice direct, thoughtful, and lightly wry. The name supplies the humor;
the product copy should explain the workflow. Prefer concrete words such as
plan, decision, agreement, and review over abstract AI claims.

| Color    | Proposed value | Role                                    |
| -------- | -------------- | --------------------------------------- |
| Teal     | `#007D75`      | Mark and primary actions                |
| Graphite | `#242B28`      | Text and dark editorial sections        |
| Paper    | `#F7F5EF`      | Marketing background                    |
| Mint     | `#DCEBE4`      | Agreed passages and supporting surfaces |
| Amber    | `#D7A451`      | Small attention accents                 |

Use bold sans-serif headings, readable sans-serif body copy, small monospace
labels, and an occasional serif sentence. Preserve the dashboard's existing
neutral surfaces and semantic teal tokens when implementing; these proposed
marketing colors do not replace application status semantics. Check actual
contrast and small-size logo clarity during implementation.

## Landing-page copy and structure

1. Navigation: How it works · GitHub review · Log in · **Start a plan**.
2. Hero eyebrow: **Engineering intent, kept intact.** Headline: **Keep the why
   with the work.** Supporting copy: “Make the plan together. Record the
   decisions. See where your pull requests depart from what you agreed.”
3. Product example: an incident-search plan requires incident text to stay
   inside company-managed infrastructure. A PR sends it to an external API.
   Show the cited passage, the exact conflicting code, and the reviewed version.
4. Workflow headline: **The code changed. Did the agreement?** Steps:
   **Talk it through** — Surface the questions before implementation.
   **Make it explicit** — Bind a version your team agrees to build.
   **Review against the plan** — Get findings with plan citations and code evidence.
5. Evidence section: **A review you can trace.** “Advisory findings. Exact
   citations. Your team decides what happens next.” Connect discussion,
   bound plan, and GitHub finding.
6. Closing: **Next time someone asks why, have an answer.** CTA: **Start a plan**.

Keep the three resolution paths visible: revise the code, amend the plan, or
record an exception. Do not imply that the agent approves plans or blocks merges.
Do not add testimonials, adoption statistics, pricing, or availability claims
without supporting information.

## Assets and implementation notes

- `identity-concept.png`: logo, wordmark, application icon, and palette board.
- `landing-page-concept.png`: desktop page design with illustrative product UI.
- `logo-concept-white.png`: standalone raster mark on white.
- `generation-prompts.md`: final prompts for the three retained images.

The raster logo is an exploration asset. Rebuild the selected mark as a clean
SVG with monochrome, reversed, and favicon variants before production use.
The transparent image-generation attempts produced unwanted halos and are not
included in the deliverables.

The generated landing-page image is a composition reference. Its sample diff
does not prove that incident data leaves the approved boundary; replace it with
a concrete external request and payload in the actual page. Replace incidental
generated dates with a coherent example, and build real text and responsive
components rather than shipping the image as the page.

Product grounding: `docs/hackathon-product-plan.md`, the workspace screenshot,
and the UI system documented in `README.md`. The private co.codes routing
contract could not be reached because its hostname did not resolve in this
environment; no private catalog content was used.
