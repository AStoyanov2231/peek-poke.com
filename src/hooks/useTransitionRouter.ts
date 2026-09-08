"use client";

import { useRouter } from "next/navigation";

export function useTransitionRouter() {
  const router = useRouter();

  const push = (href: string, options?: Parameters<typeof router.push>[1]) => {
      if (typeof document !== "undefined" && "startViewTransition" in document) {
        (document as any).startViewTransition(() => router.push(href, options));
      } else {
        router.push(href, options);
      }
  };

  const replace = (href: string, options?: Parameters<typeof router.replace>[1]) => {
      if (typeof document !== "undefined" && "startViewTransition" in document) {
        (document as any).startViewTransition(() => router.replace(href, options));
      } else {
        router.replace(href, options);
      }
  };

  return { ...router, push, replace };
}
