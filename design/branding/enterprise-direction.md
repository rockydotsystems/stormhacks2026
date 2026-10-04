# Enterprise brand direction — revision 2

The requested direction is polished, clean, and professional, inspired by
Linear, Slack, Jira, and Notion. This replaces the playful decision-trail concept.

## Identity

- A compact abstract alignment symbol with two offset planes and a shared seam.
- A single-line, medium-weight wordmark: **why did we choose this**.
- The exact domain **whydidwechoosethis.tech** appears in the footer and supporting materials.
- Neutral sans-serif typography, normal letter spacing, precise alignment, and restrained scale.
- White and cool-gray surfaces; black text; teal for primary actions and small accents.

| Role              | Proposed color |
| ----------------- | -------------- |
| Primary text      | `#16181B`      |
| Background        | `#FFFFFF`      |
| Secondary surface | `#F6F7F8`      |
| Secondary text    | `#6B7078`      |
| Brand accent      | `#087F79`      |

Keep the existing dashboard semantic tokens during implementation. Verify
contrast for actual typography and control states; proposed swatches are not
a verified accessible token system.

The product name already carries personality. Use concrete, professional copy
and make the interface the main visual. Avoid literal question marks, branching
motifs, warm paper textures, oversized slogans, and ornamental illustrations.

## Landing page

Hero: **Engineering decisions. Shared context.**

Bring plans, team discussions, and pull request reviews into one place.
Preserve what you agreed to build—and why.

Primary action: **Start a plan**. Secondary: **Explore the workflow**.

Use a single large, frontal workspace preview showing a document alongside
team discussion. Follow with a restrained review example that connects an
agreed constraint to the conflicting code and names the reviewed version.

Feature headline: **Review against the agreement.**

Find consequential departures with citations to the plan and evidence from the
code. Your team decides how to resolve them.

Supporting features: **Exact plan citations**, **Version-specific findings**,
and **Human-led resolution**.

Workflow: **Plan together**, **Agree on a version**, **Keep reviews grounded**.

Closing: **Build with shared context.**

Do not imply merge blocking, autonomous approval, enterprise certifications,
unimplemented integrations, or customer adoption. Enterprise describes the
desired visual quality here, not a claim of enterprise feature availability.

## References and deliverables

Current public sites inspected: [Linear](https://linear.app/),
[Slack](https://slack.com/), [Jira](https://www.atlassian.com/software/jira), and
[Notion](https://www.notion.com/). Linear and Notion were also inspected visually.
The design takes inspiration from their clear hierarchy and product presentation;
the proposed identity is original.

- `identity-concept-v2.png`: revised identity board.
- `landing-page-concept-v2.png`: revised desktop landing-page concept.
- `generation-prompts-v2.md`: the final built-in imagegen prompts.

These are raster design explorations. The page is not implemented. Before
production, refine the selected mark into an original SVG, check favicon-scale
legibility, and build responsive components with real text. Illustrative UI in
the mockup must reflect actual supported product behavior in the implementation.
