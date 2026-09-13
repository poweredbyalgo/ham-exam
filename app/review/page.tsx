import { Suspense } from "react";
import { ReviewClient } from "./review-client";

export const metadata = { title: "错题本与收藏" };

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-xl" />}>
      <ReviewClient />
    </Suspense>
  );
}
