import type { Metadata } from "next";
import { connection } from "next/server";
import { Providers } from "@/app/providers";
import { isAuthConfigured } from "@/features/auth/server/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "StormHacks 2026",
  description: "A feature-first hackathon starter.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read server configuration at request time, not during static builds.
  await connection();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers authConfigured={isAuthConfigured()}>{children}</Providers>
      </body>
    </html>
  );
}
