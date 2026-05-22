import { TravelerDossierScreen } from "@/components/TravelAppScreens";

export default async function TravelerDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TravelerDossierScreen travelerId={id} />;
}
