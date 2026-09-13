import { Suspense } from "react";
import { ExamClient } from "./exam-client";

export const metadata = { title: "模拟考试" };

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-xl" />}>
      <ExamClient />
    </Suspense>
  );
}
