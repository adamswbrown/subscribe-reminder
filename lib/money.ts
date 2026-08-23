import type { Cycle } from "./types";

export function monthlyEquivalent(
  price: number,
  cycle: Cycle,
  customDays?: number | null
): number {
  switch (cycle) {
    case "weekly":
      return (price * 52) / 12;
    case "monthly":
      return price;
    case "quarterly":
      return price / 3;
    case "yearly":
      return price / 12;
    case "custom":
      return (price * 30.44) / (customDays || 30);
  }
}

export function formatMoney(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function cycleLabel(cycle: Cycle, customDays?: number | null): string {
  switch (cycle) {
    case "weekly":
      return "/week";
    case "monthly":
      return "/month";
    case "quarterly":
      return "/quarter";
    case "yearly":
      return "/year";
    case "custom":
      return `/${customDays || "?"} days`;
  }
}

// The product's calendar day is the UK's, not the server's UTC day (see
// BRAINSTORM: UK-first decision) — around midnight BST these differ.
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
  }).format(new Date());
}

export function addDaysISO(days: number): string {
  const [y, m, d] = todayISO().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysUntil(dateStr: string): number {
  const today = Date.parse(todayISO() + "T00:00:00Z");
  const target = Date.parse(dateStr + "T00:00:00Z");
  return Math.round((target - today) / 86400000);
}
