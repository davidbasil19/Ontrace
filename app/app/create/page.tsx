import { Suspense } from "react";
import CreateDealForm from "@/components/CreateDealForm";

export const metadata = { title: "Create OTC deal" };
export default function CreatePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-center text-2xl font-extrabold">Create an OTC deal</h1>
      <Suspense>
        <CreateDealForm />
      </Suspense>
    </div>
  );
}
