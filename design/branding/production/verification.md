# Verification — production identity and landing page

Verified October 4, 2026 against the final source and local built Worker.
No remote deployment was performed.

| Claim                      | Fresh evidence                                                                        | Result                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Repository checks          | `direnv exec . pnpm check`                                                            | Exit 0: lint, all workspace typechecks, 482 tests passed, 58 skipped, Prettier passed                        |
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
build and deployment dry-run complete successfully. A real signed-in session
was not exercised; the existing auth service tests and new home-route tests
verify routing behavior. The GitHub review panel is an explicitly labeled
planned workflow example, not an implemented review integration.

Four supplied brand exploration Markdown files needed formatting for the
repository's full Prettier check; the original concepts were not used for design.
The branding README now links to the production kit.
