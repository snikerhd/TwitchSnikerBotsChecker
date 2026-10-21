import { getScanStats } from "@/lib/scan-stats";
import LandingHome from "@/components/landing-home";

export const dynamic = "force-dynamic";

export default async function Page() {
  const stats = await getScanStats();
  return <LandingHome stats={stats} />;
}
