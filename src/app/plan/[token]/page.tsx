import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { readPublicPlanPreview } from "@/features/plans/server/plans";
import { PublicPlanPage } from "@/features/plans/components/PublicPlanPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "You’re invited | Peek & Poke",
  description:
    "A little invitation to do something together. See the time and place before you join.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token))
    return (
      <PublicPlanPage token={token} signedIn={Boolean(user)} preview={null} />
    );
  const result = await readPublicPlanPreview(token);
  return (
    <PublicPlanPage
      token={token}
      signedIn={Boolean(user)}
      preview={"data" in result && result.data ? result.data : null}
      unavailable={"unavailable" in result && result.unavailable === true}
    />
  );
}
