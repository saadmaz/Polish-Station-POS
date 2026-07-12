import { Search, Plus, MapPin, Activity, Banknote, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchPalette } from "@/components/search-palette";
import { WalkInSheet } from "@/components/walk-in-sheet";
import { BookingSheet } from "@/components/booking-sheet";
import { NotificationsPopover } from "@/components/notifications-popover";
import { ShiftModal } from "@/components/shift-modal";
import { ExpenseModal } from "@/components/expense-modal";
import { MobileNavSheet } from "@/components/app-sidebar";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function TopBar() {
  const [now, setNow] = useState<Date | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { openShift, lowStockItems } = useStore();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <header className="flex h-14 items-center gap-2 sm:gap-4 border-b border-border bg-background px-3 sm:px-5">
        {/* Phone: the sidebar is hidden, so navigation lives behind this. */}
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="md:hidden rounded-md p-2 -ml-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold hidden sm:inline">Polish Station</span>
          <span className="text-muted-foreground hidden lg:inline">| Dehiwala</span>
        </div>

        <div className="mx-2 sm:mx-4 flex-1 max-w-md hidden sm:block">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/70 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search customers, bookings, invoices…</span>
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
              ⌘K
            </kbd>
          </button>
        </div>
        <div className="flex-1 sm:hidden" />
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="sm:hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Search className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          {/* Shift status pill */}
          <button
            onClick={() => setShiftOpen(true)}
            className={cn(
              "hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              openShift
                ? "bg-success/15 text-success hover:bg-success/25"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            <Activity className="h-3.5 w-3.5" />
            {openShift ? `Shift Open · ${openShift.staffName.split(" ")[0]}` : "No Shift"}
          </button>

          {openShift && (
            <button
              onClick={() => setExpenseOpen(true)}
              title="Record cash out / bank deposit"
              className="hidden sm:inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Banknote className="h-3.5 w-3.5" /> Cash Out
            </button>
          )}

          {lowStockItems.length > 0 && (
            <span
              className="hidden md:inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
              title={`${lowStockItems.length} low/out-of-stock items`}
            >
              {lowStockItems.length}
            </span>
          )}

          <button
            onClick={() => setWalkInOpen(true)}
            className="hidden md:inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Walk-In
          </button>
          <button
            onClick={() => setBookingOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Booking
          </button>

          <NotificationsPopover />

          <div
            suppressHydrationWarning
            className="hidden lg:block border-l border-border pl-3 text-right text-xs leading-tight min-w-20"
          >
            <div className="font-mono font-semibold">
              {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
            </div>
            <div className="text-muted-foreground">
              {now
                ? now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
                : ""}
            </div>
          </div>
        </div>
      </header>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <WalkInSheet open={walkInOpen} onOpenChange={setWalkInOpen} />
      <BookingSheet open={bookingOpen} onOpenChange={setBookingOpen} />
      <ShiftModal open={shiftOpen} onOpenChange={setShiftOpen} />
      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      <MobileNavSheet open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </>
  );
}
