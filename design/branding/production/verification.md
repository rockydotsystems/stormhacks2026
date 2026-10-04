# Verification — production identity and landing page

Verified October 4, 2026 against the final source and local built Worker.
No remote deployment was performed.

| Claim                      | Fresh evidence                                                                        | Result                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Repository checks          | `direnv exec . pnpm check`                                                            | Exit 0: lint, all workspace typechecks, 483 tests passed, 58 skipped, Prettier passed                        |
| Production artifact        | `direnv exec . pnpm deploy:check`                                                     | Exit 0: application and realtime builds, Wrangler `--dry-run`                                                |
| Built runtime              | `direnv exec . pnpm start --port 3002`; isolated Chromium on `http://localhost:3002/` | Landing headline rendered; all logo images and local fonts loaded                                            |
| Desktop accessibility      | `agent-browser a11y --json`, 1440 × 1000                                              | 0 violations, 0 incomplete checks                                                                            |
| Mobile accessibility       | Same audit, 390 × 844                                                                 | 0 violations, 0 incomplete checks                                                                            |
| Saved dark workspace theme | Built Worker audit with root `.dark`                                                  | 0 violations, 0 incomplete checks; marketing surface remains white and primary button text remains white     |
| Responsive layout          | DOM measurements at 320, 390, 768, 1024, and 1440px                                   | Document width equals viewport width at every size; code scrolls inside its evidence panel                   |
| Keyboard navigation        | Tab, Enter, and ArrowRight in the running browser                                     | Visible focus; skip link focuses `main`; Product activates its anchor; mobile code panel scrolls by keyboard |
| Existing login flow        | Local GET `/login`                                                                    | HTTP 307 to WorkOS authorization; no sign-in performed                                                       |
| Home route regression      | `src/app/page.test.ts`                                                                | 3 tests cover configured/unconfigured visitors and the signed-in dashboard branch                            |
| Portable brand assets      | XML parse and image decode                                                            | 8 self-contained SVGs; 7 PNG sizes; ICO contains 16/32/48px images                                           |
| Actual usage sizes         | `/brand/preview.html`, browser device scale 1                                         | All images loaded; 16px favicon measures exactly 16 × 16 CSS pixels                                          |

Evidence captures: [brand board](brand-kit-preview.png),
[desktop landing](landing-desktop.png), [mobile landing](landing-mobile.png).

The skipped tests are existing opt-in external/database integration tests. Lint
retains one pre-existing `import/no-anonymous-default-export` warning in
`apps/mcp/src/index.ts`. Build output contains upstream bundler warnings; the
build and deployment dry-run complete successfully. The presentation update exercised the real signed-in workspace in the in-app
browser. Three projects and seven documents (four published, three drafts) were
seeded in local Postgres. Rerunning the seed inserted zero duplicates. A test
confirms remote database hosts are rejected before connecting.

Light mode was selected through the app profile menu. Authenticated workspace
and library DOM views were rendered at 2× pixel density with the actual app
stylesheet, producing lossless 2880 × 1600 and 780 × 1688 PNG masters.
Lossless WebP versions retain that resolution for retina displays. The landing page loads the appropriate
capture at each breakpoint. Fresh desktop and mobile audits each reported zero
violations and zero incomplete checks. All images loaded after scrolling to the
lazy-loaded library image; document width matched 1440, 390, and 320px viewports.
Keyboard Tab exposed the skip link and Enter focused `main`. Presentation notes
were removed from visible copy and accessibility labels.

The GitHub review panel remains a component rendering of the intended workflow;
the seeded screenshots show the actual planning and document library.

Four supplied brand exploration Markdown files needed formatting for the
repository's full Prettier check; the original concepts were not used for design.
The branding README now links to the production kit.
