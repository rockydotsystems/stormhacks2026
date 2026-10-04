# Presentation workspace

Seed the existing local workspace with realistic engineering decisions:

```sh
direnv exec . node scripts/seed-presentation.mjs
```

The script defaults to the repository's local Postgres connection. It rejects
remote hosts, writes in one transaction, and uses stable presentation IDs. A
second run preserves the records and creates no duplicates. Existing projects,
documents, and published versions are unchanged.

If the local database has several organizations, select one explicitly:

```sh
PRESENTATION_ORGANIZATION_ID=org_your_workspace direnv exec . node scripts/seed-presentation.mjs
```

Three projects cover incident search, developer platform, and workspace security.
Seven documents include four published decisions and three drafts. Search
architecture has a four-message team discussion with Jamie Lee, Matthew H.,
and Sarah Chen. The teammate identities are local presentation records; the
script does not create identity-provider accounts or send invitations.

Open `/documents/f26a0000-0000-4000-8000-000000000101` after signing in to see
the search architecture decision. This is a real persisted document with a
published version and planning conversation. It remains available for the
presentation after the screenshot session ends.

Presentation project IDs start at `f26a0000-0000-4000-8000-000000000001`;
document IDs run from `f26a0000-0000-4000-8000-000000000101` through
`f26a0000-0000-4000-8000-000000000107`. Normal application soft deletion can
retire these records later while preserving published history.
