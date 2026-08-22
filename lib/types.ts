export type Intent = "keep" | "cancel" | "review";
export type SubState = "active" | "cancelled" | "paused" | "expired";
export type Cycle = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export interface Subscription {
  id: string;
  user_id: string;
  catalog_id: string | null;
  name: string;
  category: string;
  plan_label: string | null;
  seats: number | null;
  price: number;
  currency: string;
  cycle: Cycle;
  cycle_custom_days: number | null;
  next_renewal_date: string;
  renewal_confidence: "exact" | "approximate" | "unknown";
  intent: Intent;
  trial_end_date: string | null;
  contract_end_date: string | null;
  intro_price: number | null;
  intro_ends: string | null;
  notice_period_days: number;
  action_deadline: string;
  cancel_method: string;
  cancel_url: string | null;
  payment_method: string | null;
  shared_with: string | null;
  notes: string | null;
  state: SubState;
  cancelled_effective: string | null;
  paused_until: string | null;
  created_at: string;
  updated_at: string;
}
