import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "name",
  "plan_label",
  "category",
  "price",
  "currency",
  "cycle",
  "cycle_custom_days",
  "next_renewal_date",
  "renewal_confidence",
  "intent",
  "state",
  "notice_period_days",
  "action_deadline",
  "trial_end_date",
  "contract_end_date",
  "intro_price",
  "intro_ends",
  "seats",
  "payment_method",
  "shared_with",
  "cancel_method",
  "cancel_url",
  "cancelled_effective",
  "notes",
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Leading =, +, -, @ would execute as a formula in Excel/Sheets.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const stamp = new Date().toISOString().slice(0, 10);

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const lines = [
      CSV_COLUMNS.join(","),
      ...rows.map((r) =>
        CSV_COLUMNS.map((c) => csvCell((r as Record<string, unknown>)[c])).join(
          ","
        )
      ),
    ];
    return new NextResponse(lines.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscriptions-${stamp}.csv"`,
      },
    });
  }

  return new NextResponse(
    JSON.stringify({ exported_at: new Date().toISOString(), subscriptions: rows }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="subscriptions-${stamp}.json"`,
      },
    }
  );
}
