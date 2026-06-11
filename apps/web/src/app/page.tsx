import ErrorBoundary from "@/components/ErrorBoundary";
import MissionControlLazy from "@/components/MissionControlLazy";

export const metadata = {
  title: "AI Mission Control",
};

export default function Home() {
  return (
    <ErrorBoundary>
      <MissionControlLazy />
    </ErrorBoundary>
  );
}
