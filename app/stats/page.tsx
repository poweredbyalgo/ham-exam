import { Suspense } from "react";
import { StatsClient } from "./stats-client";

export const metadata = { title: "掌握度统计" };

export default function StatsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-xl" />}>
      <StatsClient />
    </Suspense>
  );
}
