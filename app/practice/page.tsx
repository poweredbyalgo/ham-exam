import { Suspense } from "react";
import { PracticeClient } from "./practice-client";

export const metadata = { title: "顺序练习" };

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-xl" />}>
      <PracticeClient />
    </Suspense>
  );
}
