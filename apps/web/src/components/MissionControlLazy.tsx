"use client";

import dynamic from "next/dynamic";

function MissionControlFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0c0c0c]">
      <div className="text-[#555] text-sm">Loading...</div>
    </div>
  );
}

const MissionControlClient = dynamic(
  () => import("@/components/MissionControlClient"),
  { ssr: false, loading: () => <MissionControlFallback /> }
);

export default function MissionControlLazy() {
  return <MissionControlClient />;
}
