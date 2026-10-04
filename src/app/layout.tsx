import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { Providers } from "@/app/providers";
import { isAuthConfigured } from "@/features/auth/server/config";
import { themeScript } from "@/features/account/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "why did we choose this · Engineering decisions. Shared context.",
  description:
    "Bring plans and team discussions into one place. Preserve what you agreed to build—and why.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/brand/app-icon-180.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Read server configuration at request time, not during static builds.
  await connection();
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="isolate flex flex-1 flex-col">
          <Providers authConfigured={isAuthConfigured()}>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
