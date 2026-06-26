import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  MessageCircle,
  Star,
  Settings2,
  Send,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { NotificationSettings } from "@/lib/db";
import { buildWALink, buildSMSLink, fillTemplate, TEMPLATE_VARS } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

type Tab = "reminders" | "reviews" | "templates";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Send Button ─────────────────────────────────────────────────────────────

function WAButton({
  phone,
  message,
  label = "WhatsApp",
  onSent,
}: {
  phone: string;
  message: string;
  label?: string;
  onSent: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={buildWALink(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSent}
        className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {label}
      </a>
      <a
        href={buildSMSLink(phone, message)}
        onClick={onSent}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        title="Send via SMS"
      >
        SMS
      </a>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewBubble({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-green-50 border border-green-200 p-3 dark:bg-green-900/20 dark:border-green-800/40">
      <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Preview
      </p>
      <div className="rounded-lg bg-white dark:bg-card border border-green-100 dark:border-green-800/30 p-3 text-sm whitespace-pre-wrap">
        {message}
      </div>
    </div>
  );
}

// ─── Service Reminders Tab ────────────────────────────────────────────────────

function RemindersTab() {
  const { customersNeedingReminder, notificationSettingsData, recordNotification } = useStore();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);

  function buildMessage(c: { name: string; vehicles: { model: string; plate?: string }[] }) {
    const vehicle = c.vehicles[0];
    return fillTemplate(notificationSettingsData.serviceReminderTemplate, {
      customerName: c.name.split(" ")[0],
      vehicle: vehicle?.model ?? "your vehicle",
      plate: vehicle?.plate ?? "",
      daysSinceVisit: String(daysSince(null)),
      reviewLink: notificationSettingsData.googleReviewLink,
      serviceName: "",
    });
  }

  function handleSent(customerId: string, customerName: string, phone: string) {
    recordNotification({ type: "service_reminder", customerId, jobId: null, customerName, phone });
    setSent((s) => new Set(s).add(customerId));
  }

  if (customersNeedingReminder.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500 opacity-60" />
        <p className="font-medium">All caught up!</p>
        <p className="text-sm mt-1">No customers are overdue for a service reminder.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/40 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Clicking <strong>WhatsApp</strong> opens the app with the pre-filled message — review and tap Send. The customer is automatically removed from this list once marked.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Visit</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Days Since</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Vehicles</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Send</th>
            </tr>
          </thead>
          <tbody>
            {customersNeedingReminder.map((c) => {
              const days = daysSince(c.lastVisit);
              const isSent = sent.has(c.id);
              const msg = fillTemplate(notificationSettingsData.serviceReminderTemplate, {
                customerName: c.name.split(" ")[0],
                vehicle: c.vehicles[0]?.model ?? "your vehicle",
                plate: c.vehicles[0]?.plate ?? "",
                daysSinceVisit: String(days),
                reviewLink: notificationSettingsData.googleReviewLink,
                serviceName: "",
              });
              return (
                <tr key={c.id} className={cn("border-t border-border", isSent && "opacity-50")}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.lastVisit ? fmtDate(c.lastVisit) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-sm font-medium", days > 60 ? "text-destructive" : "text-amber-600")}>
                      {days}d ago
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.vehicles.map((v) => v.model).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isSent ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <WAButton
                          phone={c.phone}
                          message={msg}
                          label="WhatsApp"
                          onSent={() => handleSent(c.id, c.name, c.phone)}
                        />
                        <button
                          onClick={() => setPreview(preview === c.id ? null : c.id)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          title="Preview message"
                        >
                          {preview === c.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Inline preview rows */}
        {customersNeedingReminder.map((c) => {
          if (preview !== c.id) return null;
          const msg = fillTemplate(notificationSettingsData.serviceReminderTemplate, {
            customerName: c.name.split(" ")[0],
            vehicle: c.vehicles[0]?.model ?? "your vehicle",
            plate: c.vehicles[0]?.plate ?? "",
            daysSinceVisit: String(daysSince(c.lastVisit)),
            reviewLink: notificationSettingsData.googleReviewLink,
            serviceName: "",
          });
          return (
            <div key={`preview-${c.id}`} className="border-t border-border bg-muted/10 px-6 py-3">
              <PreviewBubble message={msg} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Review Requests Tab ──────────────────────────────────────────────────────

function ReviewsTab() {
  const { jobsNeedingReview, notificationSettingsData, recordNotification } = useStore();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);

  function handleSent(j: { id: string; customerId: string | null; customerName: string; phone: string }) {
    recordNotification({ type: "review_request", customerId: j.customerId, jobId: j.id, customerName: j.customerName, phone: j.phone });
    setSent((s) => new Set(s).add(j.id));
  }

  if (jobsNeedingReview.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Star className="mx-auto mb-3 h-10 w-10 text-amber-400 opacity-60" />
        <p className="font-medium">No pending review requests</p>
        <p className="text-sm mt-1">Review requests for recently completed jobs will appear here.</p>
      </div>
    );
  }

  const reviewLink = notificationSettingsData.googleReviewLink;
  if (!reviewLink) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <Info className="h-4 w-4" /> Set your Google Review link in the <strong>Templates & Settings</strong> tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Vehicle</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Service</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Completed</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Send</th>
          </tr>
        </thead>
        <tbody>
          {jobsNeedingReview.map((j) => {
            const isSent = sent.has(j.id);
            const msg = fillTemplate(notificationSettingsData.reviewRequestTemplate, {
              customerName: j.customerName.split(" ")[0],
              vehicle: j.vehicleModel,
              plate: j.plate,
              serviceName: j.serviceName,
              daysSinceVisit: "",
              reviewLink,
            });
            return (
              <tr key={j.id} className={cn("border-t border-border", isSent && "opacity-50")}>
                <td className="px-4 py-3">
                  <div className="font-medium">{j.customerName}</div>
                  <div className="text-xs text-muted-foreground">{j.phone}</div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div>{j.vehicleModel}</div>
                  <div className="font-mono text-xs text-muted-foreground">{j.plate}</div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{j.serviceName}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {j.completedAt ? fmtDate(j.completedAt) : "Today"}
                </td>
                <td className="px-4 py-3">
                  {isSent ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <WAButton
                        phone={j.phone}
                        message={msg}
                        label="Send Review Request"
                        onSent={() => handleSent(j)}
                      />
                      <button
                        onClick={() => setPreview(preview === j.id ? null : j.id)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        title="Preview"
                      >
                        {preview === j.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {jobsNeedingReview.map((j) => {
        if (preview !== j.id) return null;
        const msg = fillTemplate(notificationSettingsData.reviewRequestTemplate, {
          customerName: j.customerName.split(" ")[0],
          vehicle: j.vehicleModel,
          plate: j.plate,
          serviceName: j.serviceName,
          daysSinceVisit: "",
          reviewLink,
        });
        return (
          <div key={`preview-${j.id}`} className="border-t border-border bg-muted/10 px-6 py-3">
            <PreviewBubble message={msg} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const { notificationSettingsData, saveNotificationSettings } = useStore();
  const [form, setForm] = useState<NotificationSettings>(notificationSettingsData);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function save() {
    saveNotificationSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inp = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const lbl = "block text-xs font-medium text-muted-foreground mb-1";

  const sampleVars = {
    customerName: "Ashan",
    vehicle: "Toyota Aqua 2018",
    plate: "WP CAR-8821",
    serviceName: "Premium Hand Wash",
    daysSinceVisit: "35",
    reviewLink: form.googleReviewLink || "https://g.page/r/YOUR_LINK/review",
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Settings2 className="h-4 w-4" /> Settings</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={lbl}>Google Review Link</label>
            <div className="flex gap-2">
              <input
                className={cn(inp, "flex-1")}
                value={form.googleReviewLink}
                onChange={(e) => set("googleReviewLink", e.target.value)}
                placeholder="https://g.page/r/YOUR_BUSINESS/review"
              />
              {form.googleReviewLink && (
                <a href={form.googleReviewLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                  <ExternalLink className="h-4 w-4" /> Test
                </a>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Go to Google Business Profile → Get more reviews → Copy the short link</p>
          </div>
          <div>
            <label className={lbl}>Service Reminder Interval (days)</label>
            <input
              type="number"
              min={7}
              max={365}
              className={inp}
              value={form.reminderIntervalDays}
              onChange={(e) => set("reminderIntervalDays", parseInt(e.target.value) || 30)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Customers with no visit in this many days appear in Service Reminders</p>
          </div>
        </div>
      </div>

      {/* Variable reference */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Available template variables:</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_VARS.map((v) => (
            <span key={v.key} className="rounded bg-background border border-border px-2 py-0.5 font-mono text-xs" title={v.desc}>{`{${v.key}}`}</span>
          ))}
        </div>
      </div>

      {/* Templates */}
      {[
        { key: "jobReadyTemplate" as const, label: "Job Ready Notification", icon: "🚗" },
        { key: "serviceReminderTemplate" as const, label: "Service Reminder", icon: "📅" },
        { key: "reviewRequestTemplate" as const, label: "Google Review Request", icon: "⭐" },
      ].map(({ key, label, icon }) => (
        <div key={key} className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold">{icon} {label}</h3>
          <div>
            <label className={lbl}>Message Template</label>
            <textarea
              rows={4}
              className={cn(inp, "resize-none")}
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
          <PreviewBubble message={fillTemplate(form[key], sampleVars)} />
        </div>
      ))}

      <div className="flex justify-end">
        <button
          onClick={save}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
            saved ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {saved ? <><CheckCircle2 className="h-4 w-4" /> Saved!</> : <><Send className="h-4 w-4" /> Save Templates</>}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function NotificationsPage() {
  const { customersNeedingReminder, jobsNeedingReview } = useStore();
  const [tab, setTab] = useState<Tab>("reminders");

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: "reminders", label: "Service Reminders", icon: Clock3, badge: customersNeedingReminder.length || undefined },
    { id: "reviews",   label: "Review Requests",   icon: Star,   badge: jobsNeedingReview.length || undefined },
    { id: "templates", label: "Templates & Settings", icon: Settings2 },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6 text-primary" /> Notifications & Reminders
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Send service reminders and review requests via WhatsApp — one-click deep links, no backend required
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">Reminder Due</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-500">{customersNeedingReminder.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-muted-foreground">Review Requests</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-500">{jobsNeedingReview.length}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Total Pending</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-green-600">{customersNeedingReminder.length + jobsNeedingReview.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "reminders" && <RemindersTab />}
      {tab === "reviews"   && <ReviewsTab />}
      {tab === "templates" && <TemplatesTab />}
    </div>
  );
}
