"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function useTransitionRouter() {
  const router = useRouter();

  const push = useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) => {
      if (typeof document !== "undefined" && "startViewTransition" in document) {
        (document as any).startViewTransition(() => router.push(href, options));
      } else {
        router.push(href, options);
      }
    },
    [router]
  );

  const replace = useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) => {
      if (typeof document !== "undefined" && "startViewTransition" in document) {
        (document as any).startViewTransition(() => router.replace(href, options));
      } else {
        router.replace(href, options);
      }
    },
    [router]
  );

  return { ...router, push, replace };
}
