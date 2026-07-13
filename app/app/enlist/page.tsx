import { Suspense } from "react";
import { EnlistWizard } from "@/components/EnlistWizard";

export default function EnlistPage() {
  // EnlistWizard reads the OAuth ?code/?state and ?war via useSearchParams — Next 15
  // requires a Suspense boundary around it.
  return (
    <Suspense fallback={null}>
      <EnlistWizard />
    </Suspense>
  );
}
