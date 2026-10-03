import Link from "next/link";
import { Starter } from "@/features/auth/components/starter";

export default function StarterPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-primary hover:underline">
        ← Back to workspace
      </Link>
      <h1 className="mb-8 mt-6 text-3xl font-semibold tracking-tight">
        Account & starter demo
      </h1>
      <Starter />
    </main>
  );
}
