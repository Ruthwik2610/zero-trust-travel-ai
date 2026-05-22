import { PolicyCenterScreen } from "@/components/TravelAppScreens";

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PolicyCenterScreen policyId={id} />;
}
