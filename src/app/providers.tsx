"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { ThemeProvider } from "@/features/account/components/theme-provider";

export function Providers({
  children,
  authConfigured,
}: {
  children: ReactNode;
  authConfigured: boolean;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {authConfigured ? (
          <AuthKitProvider>{children}</AuthKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
