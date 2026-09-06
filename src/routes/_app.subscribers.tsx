import { createFileRoute } from "@tanstack/react-router";
import { Rss } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/subscribers")({
  head: () => ({ meta: [{ title: "Subscribers · Polish Station OS" }] }),
  component: SubscribersPage,
});

function SubscribersPage() {
  return (
    <div className="p-6">
      <PageHeader title="Subscribers" />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
        <Rss className="h-8 w-8" />
        <p className="text-sm">Nothing here yet.</p>
      </div>
    </div>
  );
}
