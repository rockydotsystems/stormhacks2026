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

An installation belongs to one local organization. Any local member can connect
or refresh it; the current data layer has no administrator roles. A user with
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

Repository permissions: Metadata, Contents, Issues, and Pull requests, all
**read-only**. Organization/account permissions are not required. The integration
requests only these read permissions when minting installation tokens, even if
the app registration grants additional write permissions. No write-back feature
is implemented.

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
- Read-only installation tokens are short-lived and request-local. Database
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
  repository reference, and receipt time—not code, issue/PR bodies, or raw payloads.
- Removal, deletion, transfer, suspension, and uninstall disable relevant access.
  Restoration requires reconnecting. Names update without changing local
  repository IDs or project links. Conflicting repository names fail rather than
  silently merging distinct GitHub identities; resolve the conflicting manual
  reference before redelivery.

The current feature records repository activity; it does not ingest repository
files, run planning jobs, mirror complete issues/PRs, or write to GitHub. Transfers
of installations between local organizations are not implemented.

## Verification

```sh
pnpm test src/features/github
pnpm check
pnpm deploy:check
```

With a disposable local `TEST_DATABASE_URL`, tests exercise the actual migration,
OAuth state expiry/replay, organization isolation, manual-reference preservation,
access-limited sync, concurrent duplicate deliveries, transaction rollback, and
suspension/restoration. GitHub HTTP boundaries in those tests are simulated;
live OAuth requires a real WorkOS session and registered GitHub callbacks.
