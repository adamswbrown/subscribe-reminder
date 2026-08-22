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

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
