import { RocketLaunchIcon } from "@phosphor-icons/react/ssr";
import { Starter } from "@/features/auth/components/starter";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <header className="mb-10 flex flex-col gap-4">
        <RocketLaunchIcon aria-hidden="true" className="size-8 text-primary" />
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          StormHacks 2026
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Ready to build.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground">
          A feature-first foundation for your next big idea.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          Next.js · Postgres · Drizzle · React Query · WorkOS · Awilix
        </p>
      </header>
      <Starter />
    </main>
  );
}
