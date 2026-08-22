"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  return v.trim();
}

function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function subscriptionFromForm(form: FormData) {
  const notSure = form.get("renewal_not_sure") === "on";
  const oneMonth = form.get("one_month") === "on";
  let nextRenewal = str(form, "next_renewal_date");
  if (!nextRenewal) {
    // Default: first of next month, flagged low-confidence
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    nextRenewal = d.toISOString().slice(0, 10);
  }
  const intent = oneMonth ? "cancel" : (str(form, "intent") ?? "review");

  return {
    catalog_id: str(form, "catalog_id"),
    name: str(form, "name") ?? "Subscription",
    category: str(form, "category") ?? "other",
    plan_label: str(form, "plan_label"),
    price: num(form, "price") ?? 0,
    currency: "GBP",
    cycle: str(form, "cycle") ?? "monthly",
    cycle_custom_days: num(form, "cycle_custom_days"),
    next_renewal_date: nextRenewal,
    renewal_confidence: notSure ? "unknown" : "exact",
    intent,
    trial_end_date: str(form, "trial_end_date"),
    contract_end_date: str(form, "contract_end_date"),
    intro_price: num(form, "intro_price"),
    intro_ends: str(form, "intro_ends"),
    notice_period_days: num(form, "notice_period_days") ?? 0,
    cancel_method: str(form, "cancel_method") ?? "website",
    cancel_url: str(form, "cancel_url"),
    notes: str(form, "notes"),
  };
}

export async function addSubscription(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("subscriptions")
    .insert({ ...subscriptionFromForm(form), user_id: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  if (form.get("add_another") === "true") {
    redirect("/dashboard/add?added=1");
  }
  redirect("/dashboard");
}

export async function updateSubscription(id: string, form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update(subscriptionFromForm(form))
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function setIntent(id: string, intent: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ intent })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function markCancelled(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      state: "cancelled",
      cancelled_effective: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function reactivate(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ state: "active", cancelled_effective: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteSubscription(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
