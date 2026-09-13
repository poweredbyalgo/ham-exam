import { Suspense } from "react";
import { ResultClient } from "./result-client";

export const metadata = { title: "考试成绩" };

export default function ExamResultPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-xl" />}>
      <ResultClient />
    </Suspense>
  );
}
