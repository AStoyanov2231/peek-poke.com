import { QueryClient } from "@tanstack/react-query";
import { safeQueryRetryDelay, shouldRetrySafeQuery } from "@peekpoke/shared";

export function createWebQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: shouldRetrySafeQuery,
        retryDelay: safeQueryRetryDelay,
      },
      mutations: { retry: false },
    },
  });
}
