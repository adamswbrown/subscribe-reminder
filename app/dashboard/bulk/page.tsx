import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/types";
import { BulkManager } from "@/components/BulkManager";
import { bulkAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BulkPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .order("name");
  const subs = (data ?? []) as Subscription[];

  return (
    <main>
      <h1 style={{ fontSize: "1.3rem" }}>Bulk edit</h1>
      <p className="muted" style={{ maxWidth: "40rem", lineHeight: 1.6 }}>
        Tick any number of subscriptions, then apply an action to all of them
        at once — set intent, snooze reminders, mark cancelled, or delete.
      </p>
      {subs.length === 0 ? (
        <p className="muted">Nothing here yet — add some subscriptions first.</p>
      ) : (
        <BulkManager subs={subs} act={bulkAction} />
      )}
    </main>
  );
}
