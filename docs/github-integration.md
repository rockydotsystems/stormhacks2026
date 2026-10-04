# GitHub integration

One GitHub App supplies user OAuth and repository installation access. WorkOS
continues to authenticate the application user. GitHub never creates a local
account or organization automatically.

## Connect an organization

1. Sign in with WorkOS and select a local organization in the sidebar.
2. Open **GitHub connections** in the account menu, or `/settings/github`.
3. Install the GitHub App on a GitHub account or organization. Select only the
   repositories you want to share, then return to the settings page.
4. Select **Connect GitHub** and authorize GitHub. No account name is required.
5. Choose a personal account or organization from GitHub's installation list and
   select **Link selected account**. Repositories readable by both the app and your GitHub user
   become available in the existing project repository picker.

GitHub is optional: a workspace does not need a GitHub organization or any
GitHub connection. If no installations are available, install the app on a
personal account or organization and authorize again. Suspended installations
and installations linked to another workspace are disabled in the picker.

Workspace membership is managed independently in WorkOS. Teammates without
GitHub accounts or access to the linked GitHub organization can still read and
contribute to shared documents, planning conversations, and decisions. Linking
repositories shares their enrolled context with the whole WorkOS workspace;
it does not grant those teammates GitHub access or import GitHub members.

An installation belongs to one WorkOS organization. Any active WorkOS member can connect
or refresh it; this is not an Admin-only action. A user with
GitHub read access can share those repositories with the local organization.
Choose that organization deliberately. No repositories outside that user's access
are enrolled. Reconnecting replaces the installation's active repository set
with the current connecting user's accessible set. Existing links and history
are retained when access is lost.

**Refresh repository access** updates names and availability only for enrolled
repository IDs. Newly selected repositories require another OAuth connection.
Manual repository references remain supported but do not grant GitHub access.
The initial implementation supports installations of up to 500 repositories.

## App registration

| Setting                                        | Value                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Homepage                                       | `https://whydidwechoosethis.tech`                                                     |
| OAuth callback                                 | `https://whydidwechoosethis.tech/api/github/callback`                                 |
| Local OAuth callback                           | `http://localhost:3000/api/github/callback`                                           |
| Expire user authorization tokens               | Enabled                                                                               |
| Request user authorization during installation | Enabled; an unsolicited callback redirects to settings to start the secure connection |
| Device flow                                    | Disabled                                                                              |
| Setup URL                                      | Blank                                                                                 |
| Webhook URL                                    | `https://whydidwechoosethis.tech/api/github/webhooks`                                 |
| Webhook payload                                | JSON                                                                                  |
| Webhook secret                                 | Same value as `GITHUB_WEBHOOK_SECRET`                                                 |
| SSL verification                               | Enabled                                                                               |
| Installation audience                          | Any account                                                                           |

Repository permissions: Metadata, Contents, and Issues **read-only**; Pull requests
**read and write** for advisory reviews. Organization/account permissions are not
required. Connection/refresh tokens still request only read permissions. Review
tokens request Pull requests write access and are restricted to the one enrolled
repository being reviewed. Existing installations must accept the app's updated
permissions before reviews can be posted.

Subscribe to Push, Repository, Issues, Issue comment, Pull request, Pull request
review, and Pull request review comment. GitHub automatically sends installation
and installation-repository events. Enable webhooks only after the handler and
migration are deployed. Local webhook delivery requires a tunnel or relay.

## Runtime configuration and migration

Set these in ignored `.dev.vars` locally and Cloudflare Worker secrets in
production:

- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_PRIVATE_KEY`: PEM content, not a filesystem path. Quoted multiline PEM
  or double-quoted content with escaped newlines both work.
- `GITHUB_WEBHOOK_SECRET`

`GITHUB_APP_URL` may be retained for reference but is not used by the runtime.
The application origin comes from `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, not incoming
Host headers. For local development use the same origin as WorkOS and register
its GitHub callback URL. Production uses the canonical HTTPS domain.

Migration `0006_github_integration.sql` adds installations, repository-access mappings,
short-lived OAuth states, and delivery metadata. It does not alter existing
repository or project rows. Apply committed migrations using the existing direct
database migration workflow before deploying. Do not migrate from a Worker
request. GitHub credentials are runtime-only; GitHub Actions does not need copies.

Migration `0009_github_installation_selection.sql` adds short-lived encrypted
installation-selection sessions and removes the obsolete OAuth account-name
field. Apply it before deploying the picker. Encryption uses a domain-separated
key derived from the existing `GITHUB_CLIENT_SECRET`; no new secret is needed.
Rotating that secret invalidates pending selections, not existing connections.

## Security and delivery behavior

- OAuth uses PKCE S256 and a random HttpOnly, SameSite=Lax state cookie (Secure
  on HTTPS). Hashed state expires after ten minutes, is tied to the WorkOS user
  and local organization, and is atomically consumed before exchanging the code.
  Membership is rechecked on callback and inside the connection transaction.
- The callback ignores client-supplied installation IDs and redirect targets.
  GitHub's authenticated installation list supplies the picker choices. Selection
  re-fetches that list and repositories before linking, and rechecks membership.
  OAuth credentials are encrypted with AES-256-GCM in a ten-minute selection
  session, bound to the random handle, WorkOS user, and workspace. Successful
  linking atomically deletes that session. Expired sessions are unusable and are
  cleaned up on subsequent authorization starts. Refresh tokens are discarded;
  user tokens are never returned to the browser or logged. Restarting
  authorization invalidates previous selections. No long-term user token is kept.
- Installation tokens are short-lived and request-local. Database
  clients use the existing scoped Hyperdrive lifecycle.
- Webhooks verify HMAC-SHA256 over raw bytes before JSON parsing. Bodies are
  limited to 1 MiB. Signed pings and unhandled event types are acknowledged without
  opening a database connection. Connected installation events are processed
  synchronously and committed before returning 202.
- A unique delivery ID and a transaction make duplicate delivery harmless.
  Failed processing rolls back the delivery record so a redelivery can retry.
  GitHub does not automatically redeliver failed webhooks; use the app's Recent
  deliveries page to inspect and manually redeliver failures.
- Only enrolled repository events are retained. Activity stores event/action,
  repository reference, and receipt time. ADR review jobs additionally retain the
  PR title/body, exact head/base commits, frozen published decisions, and generated
  findings. Diffs are sent to the configured model but are not stored wholesale.
- Removal, deletion, transfer, suspension, and uninstall disable relevant access.
  Restoration requires reconnecting. Names update without changing local
  repository IDs or project links. Conflicting repository names fail rather than
  silently merging distinct GitHub identities; resolve the conflicting manual
  reference before redelivery.

Transfers of installations between local organizations are not implemented.

## Published ADR reviews

PR `opened`, `reopened`, `synchronize`, `ready_for_review`, and `edited` events
transactionally enqueue `github_review_jobs` alongside delivery deduplication. Once the first eligible review for a PR is committed, the webhook immediately posts a PR comment listing the frozen published ADR versions and confirming that the review is queued. This acknowledgement does not wait for the cron or model. Later edits (including bot description updates), pushes, reopening, and repeated deliveries do not post another acknowledgement for that PR; fresh review inputs are still queued. Admission skips do not consume the acknowledgement. If GitHub rejects the acknowledgement, the review stays queued and the Worker logs `GitHub ADR review acknowledgement failed` with its job ID.
The repository's existing project links determine scope: every non-deleted linked
project contributes the latest published version of each non-deleted document.
Documents without a publication never enter the review. If a repository belongs
to several projects, all their published ADRs apply. Nothing chooses ADRs from
the PR's text.

The job captures immutable version IDs and their frozen title/content in one
database read, together with the PR head/base commits and description. Later draft
edits or publication cannot alter a queued review. An equivalent event for the
same commits, description, and version set does not create a duplicate job. A new
publication changes the version set for the next PR event; publish v2 and reopen
the PR or push another commit to review against v2. Publication alone does not
trigger a review.

The main Worker's scheduled handler processes one job per minute. This durable
Postgres outbox needs no separately provisioned queue. Pending jobs survive
restarts. Ten-minute leases serialize reviews of a given PR; expired leases are
recovered, and failures retry up to three times with increasing minute delays.
An exhausted job remains `failed` with a safe diagnostic reason. The processor
creates/disposes its own scoped Postgres client, independent of HTTP requests.

The reviewer uses the existing `AI_PROVIDER`, `OPENROUTER_API_KEY`, and
`OPENROUTER_MODEL`. It reads paginated PR files, never executes submitted code,
and checks for contradictions, consequential scope/architecture changes, missing
requirements in the PR's stated scope, and ambiguity. Ordinary implementation
choices remain discretionary. Every finding must quote an actual published ADR
passage and code from the named diff line. Invalid citations are rejected rather
than posted. Missing or incomplete textual diffs become explicit limitations.

The bot submits one GitHub `COMMENT` review containing a version/commit summary
and inline findings. It never approves, requests changes, or creates a merge
gate. Publication citations link to authenticated
`/documents/:documentId?version=:versionId`, which opens the published snapshot in the document viewer. The authenticated `GET /api/github/decisions/:versionId` endpoint also returns the frozen snapshot and
checks WorkOS membership. Readers need access to the workspace to open it.

Repository access and PR commit/description/draft state are rechecked before
posting. Obsolete jobs are skipped. Results persist before the GitHub write;
retries look for this app's review marker to recover a lost response without
duplicating comments. GitHub has no atomic compare-and-post API: a push arriving
between the final read and write can still produce a review on the old commit,
but its explicit `commit_id` keeps it attached to that commit.

Limits: 50 published ADRs, 200 changed files, 150,000 characters of queued context,
200,000 characters of model evidence, and a two-minute model call. Inputs beyond
these bounds are skipped or fail explicitly, never reported compliant. Files are
reviewed through their diff context; missing requirements or broader architectural
effects outside that context cannot be established confidently. An empty finding
list is not a correctness certification.

Apply migration `0015_github_adr_reviews.sql` through the existing migration
workflow, update/accept the GitHub App permission, then deploy the Worker with
its cron trigger. No additional runtime secret is required. Deployment still
requires explicit approval.

For local development, the Vite plugin exposes the scheduled handler at
`http://localhost:3000/cdn-cgi/handler/scheduled`; production scheduling starts
only after deployment. Inspect `github_review_jobs.status`, `reason`, `attempts`,
`review_id`, and the pinned `input` to diagnose a pending, skipped, or failed review.

## Verification

```sh
pnpm test src/features/github
pnpm check
pnpm deploy:check
# Disposable local Postgres integration tests:
TEST_DATABASE_URL=postgres://stormhacks:stormhacks@127.0.0.1:5432/stormhacks pnpm test src/features/github
# Optional synthetic live model eval; reads ignored local model configuration:
GITHUB_REVIEW_LIVE=1 pnpm test src/features/github/server/review.live.test.ts
```

With a disposable local `TEST_DATABASE_URL`, tests exercise the actual migration,
OAuth state expiry/replay, organization isolation, manual-reference preservation,
access-limited sync, concurrent duplicate deliveries, transaction rollback, and
suspension/restoration. GitHub HTTP boundaries in those tests are simulated;
live OAuth requires a real WorkOS session and registered GitHub callbacks.
