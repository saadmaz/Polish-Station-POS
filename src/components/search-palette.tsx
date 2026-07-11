import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { User, Calendar, FileText } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const navigate = useNavigate();
  const { customers, bookings, invoices } = useStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  const q = query.toLowerCase();

  const matchedCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q),
  );

  const matchedBookings = bookings.filter(
    (b) =>
      b.customerName.toLowerCase().includes(q) ||
      b.serviceName.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      b.plate.toLowerCase().includes(q),
  );

  const matchedInvoices = invoices.filter(
    (i) =>
      i.customerName.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q),
  );

  function go(to: string) {
    onOpenChange(false);
    setQuery("");
    navigate({ to });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search customers, bookings, invoices…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {matchedCustomers.length > 0 && (
          <CommandGroup heading="Customers">
            {matchedCustomers.slice(0, 5).map((c) => (
              <CommandItem key={c.id} value={c.id + c.name} onSelect={() => go("/customers")}>
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.phone} · {c.tier}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedCustomers.length > 0 && matchedBookings.length > 0 && <CommandSeparator />}

        {matchedBookings.length > 0 && (
          <CommandGroup heading="Bookings">
            {matchedBookings.slice(0, 5).map((b) => (
              <CommandItem
                key={b.id}
                value={b.id + b.customerName}
                onSelect={() => go("/bookings")}
              >
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{b.id}</span>
                <span className="ml-2 text-sm">{b.customerName}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {b.date} {b.time} · {b.serviceName}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedBookings.length > 0 && matchedInvoices.length > 0 && <CommandSeparator />}

        {matchedInvoices.length > 0 && (
          <CommandGroup heading="Invoices">
            {matchedInvoices.slice(0, 5).map((i) => (
              <CommandItem key={i.id} value={i.id + i.customerName} onSelect={() => go("/pos")}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{i.id}</span>
                <span className="ml-2 text-sm">{i.customerName}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  LKR {i.total.toLocaleString()} · {i.status}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
