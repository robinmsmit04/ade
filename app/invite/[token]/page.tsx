import { CrewApp } from "@/components/crew-app";
export default async function Invite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CrewApp inviteToken={token} />;
}
