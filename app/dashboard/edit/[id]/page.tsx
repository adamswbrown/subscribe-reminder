import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/types";
import { findService } from "@/lib/catalog";
import { SubscriptionForm } from "@/components/SubscriptionForm";
import { updateSubscription, deleteSubscription } from "../../actions";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) notFound();
  const sub = data as Subscription;
  const service = sub.catalog_id ? findService(sub.catalog_id) : undefined;

  const update = updateSubscription.bind(null, sub.id);
  const remove = deleteSubscription.bind(null, sub.id);

  return (
    <main>
      <h1 style={{ fontSize: "1.3rem" }}>Edit {sub.name}</h1>
      <p className="muted">
        Price changes are kept in history automatically — edit freely.
      </p>
      <SubscriptionForm
        initial={{
          catalog_id: sub.catalog_id,
          name: sub.name,
          category: sub.category,
          plan_label: sub.plan_label,
          price: sub.price,
          cycle: sub.cycle,
          cycle_custom_days: sub.cycle_custom_days,
          next_renewal_date: sub.next_renewal_date,
          renewal_confidence: sub.renewal_confidence,
          intent: sub.intent,
          trial_end_date: sub.trial_end_date,
          contract_end_date: sub.contract_end_date,
          intro_price: sub.intro_price,
          intro_ends: sub.intro_ends,
          notice_period_days: sub.notice_period_days,
          cancel_method: sub.cancel_method,
          cancel_url: sub.cancel_url,
          notes: sub.notes,
        }}
        plans={service?.plans}
        action={update}
        submitLabel="Save changes"
      />
      <form action={remove} style={{ marginTop: "1rem" }}>
        <button className="btn-small btn-danger">
          Delete this subscription
        </button>
      </form>
    </main>
  );
}
