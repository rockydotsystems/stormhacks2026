"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

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
    <QueryClientProvider client={queryClient}>
      {authConfigured ? (
        <AuthKitProvider>{children}</AuthKitProvider>
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}
