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
