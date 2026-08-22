// Canonical cycle lengths in days — the single source for CSV interval
// detection and next-renewal computation.
export const CYCLE_DAYS = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
} as const;

export interface ImportSuggestion {
  name: string;
  catalog_id: string | null;
  plan_label: string | null;
  price: number | null;
  cycle: "weekly" | "monthly" | "quarterly" | "yearly" | null;
  next_renewal_date: string | null;
  last_charged: string | null;
  category: string | null;
}
