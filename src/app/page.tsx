import { AuthService } from "@/features/auth/server/auth.service";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import { LandingPage } from "@/features/landing/components/landing-page";

export default async function Home() {
  const session = await new AuthService().getSession();
  return session.user ? <Dashboard /> : <LandingPage />;
}
