"use client";

import { useSession } from "@/features/auth/client/queries";
import { NotesPanel } from "@/features/notes/components/notes-panel";

export function Starter() {
  const session = useSession();

  if (session.isPending) return <p role="status">Loading your session…</p>;
  if (session.error) return <p role="alert">{session.error.message}</p>;

  if (!session.data.configured) {
    return (
      <section
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-6"
        aria-labelledby="setup-heading"
      >
        <h2 id="setup-heading" className="text-lg font-semibold">
          Connect WorkOS to get started
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Add your WorkOS credentials to <code>.env.local</code> and restart the
          dev server. See the README for database setup and authentication
          settings.
        </p>
        <p className="mt-4 text-sm text-zinc-600">
          Protected APIs stay locked until authentication is configured.
        </p>
      </section>
    );
  }

  if (!session.data.user) {
    return (
      <section className="space-y-4">
        <p className="text-zinc-600">
          Sign in to try the example notes feature.
        </p>
        <a
          href="/login"
          className="inline-flex rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white"
        >
          Sign in with WorkOS
        </a>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-5">
        <p className="break-all text-sm text-zinc-600">
          Signed in as {session.data.user.email}
        </p>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium">
            Sign out
          </button>
        </form>
      </div>
      <NotesPanel userId={session.data.user.id} />
    </div>
  );
}
