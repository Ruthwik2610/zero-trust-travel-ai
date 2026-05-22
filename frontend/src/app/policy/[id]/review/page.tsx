import { PolicyReviewScreen } from "@/components/TravelAppScreens";

export default async function PolicyReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PolicyReviewScreen policyId={id} />;
}
