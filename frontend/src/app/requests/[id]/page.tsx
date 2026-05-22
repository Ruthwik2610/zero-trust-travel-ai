import { RequestWorkspaceScreen } from "@/components/TravelAppScreens";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestWorkspaceScreen requestId={id} />;
}
