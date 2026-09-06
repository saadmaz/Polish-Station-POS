import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/inspection")({
  head: () => ({ meta: [{ title: "Inspection · Polish Station OS" }] }),
  component: InspectionPage,
});

function InspectionPage() {
  return (
    <div className="p-6">
      <PageHeader title="Inspection" />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
        <ClipboardCheck className="h-8 w-8" />
        <p className="text-sm">Nothing here yet.</p>
      </div>
    </div>
  );
}
