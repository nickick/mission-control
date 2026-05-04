"use client";

import dynamic from "next/dynamic";

const MissionControlClient = dynamic(
  () => import("@/components/MissionControlClient"),
  { ssr: false }
);

export default function MissionControlLazy() {
  return <MissionControlClient />;
}
