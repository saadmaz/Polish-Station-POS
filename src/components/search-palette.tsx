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
import { CUSTOMERS, BOOKINGS, INVOICES } from "@/lib/mock-data";

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const navigate = useNavigate();
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

  const matchedCustomers = CUSTOMERS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q),
  );

  const matchedBookings = BOOKINGS.filter(
    (b) =>
      b.customer.toLowerCase().includes(q) ||
      b.service.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q),
  );

  const matchedInvoices = INVOICES.filter(
    (i) =>
      i.customer.toLowerCase().includes(q) ||
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
            {matchedCustomers.map((c) => (
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
            {matchedBookings.map((b) => (
              <CommandItem key={b.id} value={b.id + b.customer} onSelect={() => go("/bookings")}>
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{b.id}</span>
                <span className="ml-2 text-sm">{b.customer}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {b.time} · {b.service}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedBookings.length > 0 && matchedInvoices.length > 0 && <CommandSeparator />}

        {matchedInvoices.length > 0 && (
          <CommandGroup heading="Invoices">
            {matchedInvoices.map((i) => (
              <CommandItem key={i.id} value={i.id + i.customer} onSelect={() => go("/pos")}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{i.id}</span>
                <span className="ml-2 text-sm">{i.customer}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  Rs {i.total.toLocaleString()} · {i.status}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
