import { PlanDetailPage } from "@/features/plans/components/PlanDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  return <PlanDetailPage planId={planId} />;
}
