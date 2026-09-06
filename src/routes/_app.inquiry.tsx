import { createFileRoute } from "@tanstack/react-router";
import { MessageCircleQuestion } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/inquiry")({
  head: () => ({ meta: [{ title: "Inquiry · Polish Station OS" }] }),
  component: InquiryPage,
});

function InquiryPage() {
  return (
    <div className="p-6">
      <PageHeader title="Inquiry" />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
        <MessageCircleQuestion className="h-8 w-8" />
        <p className="text-sm">Nothing here yet.</p>
      </div>
    </div>
  );
}
