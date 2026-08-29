// Single source of truth for displaying an LKR amount. Before this, ~50 call
// sites across the app each rolled their own `LKR ${x.toLocaleString()}` (no
// explicit locale, so output silently depends on the browser's locale
// setting) while the PDF builder (pdf.ts) independently forced 2 decimal
// places with an explicit "en-US" locale. Every amount this app actually
// generates -- invoice totals, prices, PO lines -- is built from whole-rupee
// unit prices and integer quantities, so 0 decimals is what the data already
// looks like everywhere except that one outlier; this standardizes on that
// (and on a pinned locale) rather than adding decimals everywhere else.
export function formatCurrency(amount: number): string {
  return `LKR ${amount.toLocaleString("en-US")}`;
}
