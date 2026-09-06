import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { isManagerOrAbove } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Search, Mail, Trash2, RotateCcw, Ban } from "lucide-react";
import { formatDate } from "@/lib/date-format";
import { useConfirm } from "@/hooks/use-confirm";
import type { NewsletterSubscriber, NewsletterStatus } from "@/lib/db";

export const Route = createFileRoute("/_app/subscribers")({
  head: () => ({ meta: [{ title: "Subscribers · Polish Station OS" }] }),
  component: SubscribersPage,
});

type Tone = "info" | "warning" | "success" | "neutral" | "danger";
const STATUS_TONE: Record<NewsletterStatus, Tone> = {
  subscribed: "success",
  unsubscribed: "neutral",
};

function SubscriberCard({
  subscriber,
  canManage,
  onToggle,
  onDelete,
}: {
  subscriber: NewsletterSubscriber;
  canManage: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const subscribed = subscriber.status === "subscribed";
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{subscriber.email}</span>
            <StatusChip variant={STATUS_TONE[subscriber.status]}>{subscriber.status}</StatusChip>
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {subscriber.source} · {formatDate(subscriber.subscribedAt)}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={onToggle}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={subscribed ? "Unsubscribe" : "Resubscribe"}
            >
              {subscribed ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubscribersPage() {
  const { newsletterSubscribers, toggleSubscriberStatus, deleteSubscriber } = useStore();
  const { staff } = useAuth();
  const canManage = isManagerOrAbove(staff?.role);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | NewsletterStatus>("All");
  const { confirm, ConfirmDialog } = useConfirm();

  const filtered = newsletterSubscribers.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || s.email.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "All" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const subscribedCount = newsletterSubscribers.filter((s) => s.status === "subscribed").length;

  function handleToggle(s: NewsletterSubscriber) {
    toggleSubscriberStatus(s);
    toast.success(s.status === "subscribed" ? "Unsubscribed" : "Resubscribed");
  }

  async function handleDelete(s: NewsletterSubscriber) {
    if (!(await confirm({ title: `Delete "${s.email}"?`, requirePin: true }))) return;
    deleteSubscriber(s.id);
    toast.success("Subscriber deleted");
  }

  return (
    <div className="p-4 sm:p-6">
      {ConfirmDialog}
      <PageHeader
        title="Subscribers"
        subtitle={`${newsletterSubscribers.length} total · ${subscribedCount} subscribed`}
      />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search by email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "All" | NewsletterStatus)}
          >
            <option value="All">All Statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>

        {/* Mobile: stacked cards */}
        <div className="divide-y divide-border md:hidden">
          {filtered.map((s) => (
            <SubscriberCard
              key={s.id}
              subscriber={s}
              canManage={canManage}
              onToggle={() => handleToggle(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search || statusFilter !== "All"
                ? "No subscribers match your filter"
                : "No subscribers yet"}
            </div>
          )}
        </div>

        {/* Tablet/desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Email</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Source</th>
                <th className="text-left px-3 py-2.5">Subscribed</th>
                <th className="w-24 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40 align-top">
                  <td className="px-5 py-3 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {s.email}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip variant={STATUS_TONE[s.status]}>{s.status}</StatusChip>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{s.source}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDate(s.subscribedAt)}
                  </td>
                  <td className="px-3 py-3">
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggle(s)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={s.status === "subscribed" ? "Unsubscribe" : "Resubscribe"}
                        >
                          {s.status === "subscribed" ? (
                            <Ban className="h-3.5 w-3.5" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground">
                    {search || statusFilter !== "All"
                      ? "No subscribers match your filter"
                      : "No subscribers yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
