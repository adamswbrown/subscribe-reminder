import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CATALOG } from "@/lib/catalog";
import { todayISO } from "@/lib/money";
import type { ImportSuggestion } from "@/lib/importTypes";

export const maxDuration = 120;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];
const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024;

function extractionPrompt(): string {
  const services = CATALOG.map((s) => `${s.id}: ${s.name}`).join("\n");
  return `You are extracting a person's subscriptions from screenshots or PDFs they
took of pages like the iOS Settings > Subscriptions list, Google Play subscriptions,
a bank's direct-debit list, PayPal automatic payments, Amazon memberships, or a bank
statement. Today's date is ${todayISO()}. Amounts are GBP unless clearly stated otherwise.

Extract every distinct subscription you can see. For each, return an object:
- "name": the service name as shown
- "catalog_id": the matching id from the catalog below, or null if none matches
- "plan_label": the plan/tier if visible (e.g. "Premium", "Family"), else null
- "price": the recurring charge as a number, else null
- "cycle": "weekly" | "monthly" | "quarterly" | "yearly" if determinable, else null
- "next_renewal_date": "YYYY-MM-DD" if a renewal/expiry/next-payment date is shown
  (resolve relative or partial dates using today's date), else null
- "last_charged": "YYYY-MM-DD" if only a last-payment date is shown, else null
- "category": one of streaming|music|news|gaming|gym|broadband|mobile|utilities|storage|software|books|food|insurance|bundle|other, else null

Skip one-off purchases and expired/cancelled entries. Respond with ONLY a JSON array
(no markdown fences, no commentary). If nothing is found, respond with [].

Catalog:
${services}`;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Screenshot import isn't configured on the server yet." },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0 || files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Upload between 1 and ${MAX_FILES} files.` },
      { status: 400 }
    );
  }

  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name} is over 8MB.` },
        { status: 400 }
      );
    }
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    if (file.type === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      });
    } else if (IMAGE_TYPES.includes(file.type as ImageMediaType)) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as ImageMediaType,
          data,
        },
      });
    } else {
      return NextResponse.json(
        { error: `${file.name}: unsupported type ${file.type || "unknown"}.` },
        { status: 400 }
      );
    }
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      messages: [
        {
          role: "user",
          content: [...blocks, { type: "text", text: extractionPrompt() }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to process this file." },
        { status: 422 }
      );
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    let suggestions: ImportSuggestion[];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      suggestions = parsed;
    } catch {
      return NextResponse.json(
        { error: "Couldn't read subscriptions from this file — try a clearer screenshot." },
        { status: 422 }
      );
    }
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Screenshot import is misconfigured (invalid API key)." },
        { status: 503 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Import is busy — try again in a minute." },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Import failed (${error.status}).` },
        { status: 502 }
      );
    }
    throw error;
  }
}
