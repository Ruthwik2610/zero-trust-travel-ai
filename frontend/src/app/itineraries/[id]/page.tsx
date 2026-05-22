import { ItineraryBuilderScreen } from "@/components/TravelAppScreens";

export default async function ItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItineraryBuilderScreen requestId={id} />;
}
