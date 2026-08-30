import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { apiFetch, jsonBody } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export async function deleteCurrentAccount(queryClient: QueryClient) {
  await apiFetch("/api/account/delete", {
    method: "POST",
    body: jsonBody({ confirmation: "DELETE" }),
  });
  await supabase.auth.signOut({ scope: "local" });
  queryClient.clear();
  router.replace("/(auth)/login");
}
