import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import * as db from "@/lib/db";
import type { Service } from "@/lib/db";
import { CheckCircle2, Car, Clock, Calendar, ChevronRight, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/book")({
  component: BookPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Exterior:           "bg-blue-100 text-blue-700",
  Interior:           "bg-amber-100 text-amber-700",
  "Full Detail":      "bg-purple-100 text-purple-700",
  "Paint Protection": "bg-green-100 text-green-700",
  Coating:            "bg-rose-100 text-rose-700",
};

function fmt(n: number) {
  return `Rs. ${n.toLocaleString()}`;
}

function fmtDur(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function getDateCards() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86400000);
    return {
      date: d.toISOString().slice(0, 10),
      dayName: d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
      dayNum: d.getDate(),
      monthName: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
      isToday: i === 0,
    };
  });
}

function generateSlots(durationMin: number): string[] {
  const slots: string[] = [];
  for (let t = 8 * 60; t + durationMin <= 18 * 60; t += 30) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
  return slots;
}

function isSlotFull(date: string, time: string): boolean {
  return (
    db.bookings
      .list()
      .filter(
        (b) =>
          b.date === date &&
          b.time === time &&
          b.status !== "Cancelled" &&
          b.status !== "No-Show",
      ).length >= 5
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  service: Service | null;
  date: string;
  time: string;
  name: string;
  phone: string;
  plate: string;
  vehicleModel: string;
  notes: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const labels = ["Service", "Date", "Time", "Details"];
  return (
    <div className="mb-8">
      <div className="flex items-center">
        {labels.map((label, i) => {
          const num = (i + 1) as Step;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} className="flex flex-1 items-center">
              {i > 0 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 transition-colors",
                    done || active ? "bg-red-500" : "bg-gray-200",
                  )}
                />
              )}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                    done
                      ? "bg-red-500 text-white"
                      : active
                        ? "bg-red-500 text-white ring-4 ring-red-100"
                        : "bg-gray-100 text-gray-400",
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : num}
                </div>
                <span
                  className={cn(
                    "mt-1 text-[10px] font-medium uppercase tracking-wide",
                    active ? "text-red-500" : done ? "text-gray-500" : "text-gray-300",
                  )}
                >
                  {label}
                </span>
              </div>
              {i < labels.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 transition-colors",
                    done ? "bg-red-500" : "bg-gray-200",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Service ──────────────────────────────────────────────────────────

function ServiceStep({ onSelect }: { onSelect: (s: Service) => void }) {
  const serviceList = db.services.list();
  return (
    <div>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Choose a Service</h2>
      <p className="mb-6 text-sm text-gray-500">
        Select the detailing service you'd like to book.
      </p>
      <div className="space-y-3">
        {serviceList.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4 text-left shadow-sm transition-all hover:border-red-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 group-hover:bg-red-100 transition-colors">
              <Car className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900">{s.name}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    CAT_COLOR[s.category] ?? "bg-gray-100 text-gray-600",
                  )}
                >
                  {s.category}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {fmtDur(s.durationMin)}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-bold text-gray-900">{fmt(s.price)}</div>
              <ChevronRight className="ml-auto mt-1 h-4 w-4 text-gray-300 group-hover:text-red-400 transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Date ─────────────────────────────────────────────────────────────

function DateStep({
  onSelect,
  onBack,
}: {
  onSelect: (d: string) => void;
  onBack: () => void;
}) {
  const dateCards = useMemo(() => getDateCards(), []);
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Pick a Date</h2>
      <p className="mb-6 text-sm text-gray-500">Choose your preferred appointment date.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {dateCards.map(({ date, dayName, dayNum, monthName, isToday }) => (
          <button
            key={date}
            onClick={() => onSelect(date)}
            className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-red-300 hover:shadow-sm active:scale-95"
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              {dayName}
            </span>
            <span className="text-lg font-bold leading-tight text-gray-900">{dayNum}</span>
            <span className="text-[10px] font-medium text-gray-400">{monthName}</span>
            {isToday && (
              <span className="mt-0.5 text-[9px] font-semibold text-red-500">TODAY</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 3: Time ─────────────────────────────────────────────────────────────

function TimeStep({
  service,
  date,
  onSelect,
  onBack,
}: {
  service: Service;
  date: string;
  onSelect: (t: string) => void;
  onBack: () => void;
}) {
  const slots = useMemo(() => generateSlots(service.durationMin), [service.durationMin]);
  const fullSlots = useMemo(
    () => new Set(slots.filter((t) => isSlotFull(date, t))),
    [slots, date],
  );

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Pick a Time</h2>
      <p className="mb-6 text-sm text-gray-500">
        Available slots on <strong>{displayDate}</strong>.
      </p>
      {slots.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
          No available slots for this service on the selected date.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((t) => {
            const full = fullSlots.has(t);
            return (
              <button
                key={t}
                disabled={full}
                onClick={() => onSelect(t)}
                className={cn(
                  "rounded-xl border py-3 text-sm font-medium transition-all",
                  full
                    ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through"
                    : "border-gray-200 bg-white text-gray-700 hover:border-red-400 hover:bg-red-50 hover:text-red-600 active:scale-95",
                )}
              >
                {fmtTime(t)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Details ──────────────────────────────────────────────────────────

function DetailsStep({
  form,
  onChange,
  onBack,
  onSubmit,
}: {
  form: FormState;
  onChange: (f: Partial<FormState>) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Full name is required";
    if (!form.phone.trim()) e.phone = "Phone number is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const dateStr = form.date
    ? new Date(form.date + "T00:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Your Details</h2>
      <p className="mb-4 text-sm text-gray-500">
        Fill in your contact and vehicle information.
      </p>

      {/* Booking summary */}
      <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm">
        <div className="font-semibold text-red-700">{form.service?.name}</div>
        <div className="text-red-400">
          {dateStr} &bull; {form.time && fmtTime(form.time)} &bull;{" "}
          {form.service && fmt(form.service.price)}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Roshan Fernando"
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2",
              errors.name
                ? "border-red-300 focus:ring-red-200"
                : "border-gray-200 focus:border-red-400 focus:ring-red-100",
            )}
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="e.g. +94 77 123 4567"
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2",
              errors.phone
                ? "border-red-300 focus:ring-red-200"
                : "border-gray-200 focus:border-red-400 focus:ring-red-100",
            )}
          />
          {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Vehicle Plate
            </label>
            <input
              type="text"
              value={form.plate}
              onChange={(e) => onChange({ plate: e.target.value.toUpperCase() })}
              placeholder="e.g. CAR-1234"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm uppercase tracking-wide outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Vehicle Model
            </label>
            <input
              type="text"
              value={form.vehicleModel}
              onChange={(e) => onChange({ vehicleModel: e.target.value })}
              placeholder="e.g. Toyota Aqua"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Special Requests
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Any special instructions or requests?"
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>

      <button
        onClick={() => {
          if (validate()) onSubmit();
        }}
        className="mt-6 w-full rounded-xl bg-red-500 py-3 font-semibold text-white transition-all hover:bg-red-600 active:scale-[0.99]"
      >
        Confirm Booking
      </button>
      <p className="mt-3 text-center text-xs text-gray-400">
        Our team will confirm your appointment via WhatsApp or phone.
      </p>
    </div>
  );
}

// ─── Step 5: Confirmation ─────────────────────────────────────────────────────

function ConfirmationStep({ bookingId, form }: { bookingId: string; form: FormState }) {
  const displayDate = form.date
    ? new Date(form.date + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  // Build Google Calendar deep link
  const [yy, mm, dd] = form.date.split("-");
  const [hh, mn] = form.time.split(":");
  const startDT = `${yy}${mm}${dd}T${hh}${mn}00`;
  const endDate = new Date(
    Number(yy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mn) + (form.service?.durationMin ?? 60),
  );
  const endDT = [
    endDate.getFullYear(),
    (endDate.getMonth() + 1).toString().padStart(2, "0"),
    endDate.getDate().toString().padStart(2, "0"),
    "T",
    endDate.getHours().toString().padStart(2, "0"),
    endDate.getMinutes().toString().padStart(2, "0"),
    "00",
  ].join("");
  const gcLink =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(`${form.service?.name} — Polish Station`)}` +
    `&dates=${startDT}/${endDT}` +
    `&details=${encodeURIComponent("Car detailing appointment at Polish Station.")}`;

  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
      </div>
      <h2 className="mb-1 text-2xl font-bold text-gray-900">Booking Received!</h2>
      <p className="mb-6 text-sm text-gray-500">
        Our team will confirm your appointment shortly.
      </p>

      <div className="mb-6 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-left">
        {(
          [
            ["Booking Ref", bookingId],
            ["Service", form.service?.name ?? ""],
            ["Date", displayDate],
            ["Time", fmtTime(form.time)],
            ["Name", form.name],
            ...(form.plate
              ? [["Vehicle", `${form.plate}${form.vehicleModel ? ` · ${form.vehicleModel}` : ""}`] as [string, string]]
              : []),
          ] as [string, string][]
        ).map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-900">{value}</span>
            </div>
          ))}
        <div className="flex justify-between border-t border-gray-200 pt-2 text-sm">
          <span className="text-gray-500">Estimated Price</span>
          <span className="font-bold text-red-600">{form.service && fmt(form.service.price)}</span>
        </div>
      </div>

      <a
        href={gcLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        <Calendar className="h-4 w-4 text-blue-500" />
        Add to Google Calendar
      </a>
      <button
        onClick={() => window.location.reload()}
        className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        Book Another Appointment
      </button>

      <p className="mt-8 text-xs text-gray-300">Powered by Polish Station OS</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function BookPage() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({
    service: null,
    date: "",
    time: "",
    name: "",
    phone: "",
    plate: "",
    vehicleModel: "",
    notes: "",
  });
  const [bookingId, setBookingId] = useState("");

  const isEmbed =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embed") === "true";

  function update(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function handleSubmit() {
    if (!form.service) return;
    const id = db.bookings.nextId();
    db.bookings.upsert({
      id,
      customerId: null,
      customerName: form.name.trim(),
      phone: form.phone.trim(),
      plate: form.plate.trim().toUpperCase(),
      vehicleModel: form.vehicleModel.trim(),
      serviceId: form.service.id,
      serviceName: form.service.name,
      category: form.service.category,
      durationMin: form.service.durationMin,
      price: form.service.price,
      date: form.date,
      time: form.time,
      tech: "—",
      bay: "—",
      status: "Pending",
      notes: form.notes.trim(),
      createdAt: new Date().toISOString(),
    });
    setBookingId(id);
    setStep(5);
  }

  return (
    <div className={cn("min-h-screen bg-gray-50", isEmbed && "bg-white")}>
      {!isEmbed && (
        <header className="border-b border-gray-200 bg-white px-4 py-4">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500">
              <span className="text-sm font-black text-white">PS</span>
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-bold tracking-[0.18em] text-gray-400">POLISH</div>
              <div className="-mt-0.5 text-sm font-bold text-gray-900">STATION</div>
            </div>
            <span className="ml-auto text-xs text-gray-400">Online Booking</span>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-xl px-4 py-8">
        {step < 5 && <ProgressBar step={step} />}
        {step === 1 && (
          <ServiceStep
            onSelect={(s) => {
              update({ service: s, date: "", time: "" });
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <DateStep
            onSelect={(d) => {
              update({ date: d, time: "" });
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && form.service && (
          <TimeStep
            service={form.service}
            date={form.date}
            onSelect={(t) => {
              update({ time: t });
              setStep(4);
            }}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <DetailsStep
            form={form}
            onChange={update}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
          />
        )}
        {step === 5 && <ConfirmationStep bookingId={bookingId} form={form} />}
      </main>
    </div>
  );
}
