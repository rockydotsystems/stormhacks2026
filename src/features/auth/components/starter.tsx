"use client";

import { SignInIcon } from "@phosphor-icons/react/dist/csr/SignIn";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { useSession } from "@/features/auth/client/queries";
import { NotesPanel } from "@/features/notes/components/notes-panel";

export function Starter() {
  const session = useSession();

  if (session.isPending) return <p role="status">Loading your session…</p>;
  if (session.error) return <p role="alert">{session.error.message}</p>;

  if (!session.data.configured) {
    return (
      <Card render={<section />} aria-labelledby="setup-heading">
        <CardHeader>
          <CardTitle render={<h2 id="setup-heading" />}>
            Connect WorkOS to get started
          </CardTitle>
          <CardDescription className="leading-6">
            Add your WorkOS credentials to <code>.dev.vars</code> and restart
            the dev server. See the README for database setup and authentication
            settings.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <p className="text-sm text-muted-foreground">
            Protected APIs stay locked until authentication is configured.
          </p>
        </CardPanel>
      </Card>
    );
  }

  if (!session.data.user) {
    return (
      <section className="flex flex-col items-start gap-4">
        <p className="text-muted-foreground">
          Sign in to try the example notes feature.
        </p>
        <Button size="lg" render={<Link href="/login" />}>
          <SignInIcon aria-hidden="true" />
          Sign in with WorkOS
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <p className="break-all text-sm text-muted-foreground">
          Signed in as {session.data.user.email}
        </p>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline">
            <SignOutIcon aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </div>
      <NotesPanel userId={session.data.user.id} />
    </div>
  );
}
