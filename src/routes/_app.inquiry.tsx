import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { isManagerOrAbove } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Search, Mail, Phone, MessageCircle, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { buildWALink } from "@/lib/notifications";
import { useConfirm } from "@/hooks/use-confirm";
import type { Inquiry } from "@/lib/db";

export const Route = createFileRoute("/_app/inquiry")({
  head: () => ({ meta: [{ title: "Inquiries · Polish Station OS" }] }),
  component: InquiryPage,
});

function InquiryCard({ inquiry, onDelete }: { inquiry: Inquiry; onDelete?: () => void }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{inquiry.name}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {formatDateTime(inquiry.createdAt)}
          </div>
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <a href={`tel:${inquiry.contactNumber}`} className="hover:text-foreground">
            {inquiry.contactNumber}
          </a>
          <a
            href={buildWALink(inquiry.contactNumber, "")}
            target="_blank"
            rel="noreferrer"
            className="text-success hover:text-success/80"
            title="WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        </div>
        {inquiry.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0" /> {inquiry.email}
          </div>
        )}
        <p className="pt-1 text-foreground">{inquiry.message}</p>
      </div>
    </div>
  );
}

function InquiryPage() {
  const { inquiries, deleteInquiry } = useStore();
  const { staff } = useAuth();
  const canDelete = isManagerOrAbove(staff?.role);
  const [search, setSearch] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  const filtered = inquiries.filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.contactNumber.includes(q) ||
      (i.email ?? "").toLowerCase().includes(q) ||
      i.message.toLowerCase().includes(q)
    );
  });

  async function handleDelete(inquiry: Inquiry) {
    if (!(await confirm({ title: `Delete inquiry from "${inquiry.name}"?`, requirePin: true })))
      return;
    deleteInquiry(inquiry.id);
    toast.success("Inquiry deleted");
  }

  return (
    <div className="p-4 sm:p-6">
      {ConfirmDialog}
      <PageHeader
        title="Inquiries"
        subtitle={`${inquiries.length} from the website contact form`}
      />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search by name, contact number, email, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Mobile: stacked cards */}
        <div className="divide-y divide-border md:hidden">
          {filtered.map((i) => (
            <InquiryCard
              key={i.id}
              inquiry={i}
              onDelete={canDelete ? () => handleDelete(i) : undefined}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search ? "No inquiries match your search" : "No inquiries yet"}
            </div>
          )}
        </div>

        {/* Tablet/desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Received</th>
                <th className="text-left px-3 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Contact</th>
                <th className="text-left px-3 py-2.5">Email</th>
                <th className="text-left px-3 py-2.5">Message</th>
                <th className="w-14 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-muted/40 align-top">
                  <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(i.createdAt)}
                  </td>
                  <td className="px-3 py-3 font-semibold">{i.name}</td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <a href={`tel:${i.contactNumber}`} className="font-mono hover:text-primary">
                        {i.contactNumber}
                      </a>
                      <a
                        href={buildWALink(i.contactNumber, "")}
                        target="_blank"
                        rel="noreferrer"
                        className="text-success hover:text-success/80"
                        title="WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{i.email ?? "—"}</td>
                  <td className="px-3 py-3 max-w-sm text-xs text-muted-foreground">
                    <div className="line-clamp-2">{i.message}</div>
                  </td>
                  <td className="px-3 py-3">
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(i)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    {search ? "No inquiries match your search" : "No inquiries yet"}
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
