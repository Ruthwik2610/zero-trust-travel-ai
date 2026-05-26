import { ClientReviewPortalScreen } from "@/components/TravelAppScreens";

export default async function ClientReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientReviewPortalScreen token={token} />;
}
