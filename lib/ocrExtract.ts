// Heuristic subscription extraction from OCR'd screenshot text.
// Runs entirely in the browser — no API dependency (see BRAINSTORM:
// discovery integrations). Works best on structured lists like the iOS
// Subscriptions page, Google Play, bank direct-debit lists, and PayPal.

import { matchCatalog } from "./importDetect";
import { findService } from "./catalog";
import { todayISO } from "./money";
import type { ImportSuggestion } from "./importTypes";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const STOPWORDS =
  /^(active|inactive|expired|subscriptions?|settings|manage|edit|done|renews?|expires?|next|payment|billing|due|amount|date|direct debits?|standing orders?|automatic payments?|memberships?( & subscriptions)?|history|see all|cancel(led)?|total)$/i;

// Section headers and UI chrome that OCR merges with neighbours
const HEADER_JUNK = /^(active|inactive|expired)\b|\bsort\b/i;

// Plan-tier descriptors are details of the entry above, not services.
const PLAN_DESCRIPTOR =
  /^(standard|premium|basic|individual|family|duo|student|essential|ultimate|extra|plus|pro|lite)(\s+(plan|tier|with ads))?$|\b(plan|tier)$/i;

function parseFuzzyDate(s: string): string | null {
  // 3 Sep 2026 / Sep 3, 2026 / 03/09/2026 / 2026-09-03
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\b/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  }
  // "3 Sep 2026" / "3rd September" — scan every candidate, not just the first,
  // since OCR text is full of number-word pairs that aren't dates.
  for (const c of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})?\b/g)) {
    const month = MONTHS[c[2].slice(0, 3).toLowerCase()];
    if (month) {
      const year = c[3] ? +c[3] : inferYear(month, +c[1]);
      return `${year}-${String(month).padStart(2, "0")}-${String(+c[1]).padStart(2, "0")}`;
    }
  }
  // "Sep 3, 2026"
  for (const c of s.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/g)) {
    const month = MONTHS[c[1].slice(0, 3).toLowerCase()];
    if (month) {
      const year = c[3] ? +c[3] : inferYear(month, +c[2]);
      return `${year}-${String(month).padStart(2, "0")}-${String(+c[2]).padStart(2, "0")}`;
    }
  }
  return null;
}

// A renewal date without a year means "the next occurrence of that day".
function inferYear(month: number, day: number): number {
  const [ty, tm, td] = todayISO().split("-").map(Number);
  return month > tm || (month === tm && day >= td) ? ty : ty + 1;
}

function parsePrice(s: string): number | null {
  const m = s.match(/(?:£|gbp\s?|\$|eur?\s?)\s?(\d{1,4}(?:[.,]\d{2}))/i)
    ?? s.match(/\b(\d{1,4}[.,]\d{2})\b/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 5000 ? n : null;
}

function parseCycle(s: string): ImportSuggestion["cycle"] {
  if (/(per\s*week|\/\s*week|weekly)/i.test(s)) return "weekly";
  if (/(per\s*month|\/\s*mo(nth)?\b|monthly)/i.test(s)) return "monthly";
  if (/(per\s*quarter|quarterly|3\s*months)/i.test(s)) return "quarterly";
  if (/(per\s*year|\/\s*year|annual|yearly|12\s*months)/i.test(s)) return "yearly";
  return null;
}

function looksLikeName(line: string): boolean {
  if (line.length < 3 || line.length > 42) return false;
  if (STOPWORDS.test(line.trim())) return false;
  if (HEADER_JUNK.test(line.trim())) return false;
  if (PLAN_DESCRIPTOR.test(line.trim())) return false;
  if (parsePrice(line) !== null) return false;
  if (parseFuzzyDate(line)) return false;
  const letters = (line.match(/[A-Za-z]/g) ?? []).length;
  return letters / line.length > 0.6;
}

function firstWordKey(name: string): string {
  const w = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/)[0] ?? "";
  return w.length >= 4 ? w.toLowerCase() : "";
}

const PLAN_HINT = /membership|premium|pro\b|plan|yearly|monthly|annual|\(/i;

export function extractFromText(text: string): ImportSuggestion[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  // Catalog-matched lines mark entry boundaries: a detail window must never
  // reach into the next service's rows (that's how Athlytic once inherited
  // iCloud's price).
  const catalogAt = lines.map((l) => matchCatalog(l));

  const results: ImportSuggestion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const catalogId = catalogAt[i];
    let name: string | null = null;
    if (catalogId) {
      name = findService(catalogId)?.name ?? line;
    } else if (looksLikeName(line)) {
      name = line.replace(/[|•·>›]/g, "").replace(/^[^A-Za-z0-9]+/, "").trim();
    }
    if (!name) continue;

    let end = Math.min(i + 3, lines.length - 1);
    for (let j = i + 1; j <= end; j++) {
      if (catalogAt[j]) {
        end = j - 1;
        break;
      }
    }
    const window = lines.slice(i, end + 1).join("  ");
    const price = parsePrice(window);
    const date = parseFuzzyDate(window);
    const cycle = parseCycle(window);

    // A generic name needs at least a price or a date nearby to count.
    if (!catalogId && price === null && !date) continue;

    const isPast = date !== null && date < todayISO();
    results.push({
      name,
      catalog_id: catalogId,
      plan_label: null,
      price,
      cycle,
      next_renewal_date: !isPast ? date : null,
      last_charged: isPast ? date : null,
      category: catalogId ? (findService(catalogId)?.category ?? null) : null,
    });
  }

  // Merge plan/detail lines into their service: consecutive suggestions
  // sharing a first word ("Athlytic…" + "Athlytic Pro (Yearly)") are one
  // subscription — keep the first, fill gaps, use the detail as plan label.
  const merged: ImportSuggestion[] = [];
  const byKey = new Map<string, ImportSuggestion>();
  for (const s of results) {
    const key = s.catalog_id ?? firstWordKey(s.name) ?? s.name.toLowerCase();
    const existing = byKey.get(key);
    // Two rows for the same service with different prices are genuinely
    // separate subscriptions (e.g. two NOW memberships) — keep both.
    if (existing && existing.price != null && s.price != null && existing.price !== s.price) {
      merged.push(s);
      continue;
    }
    if (existing) {
      existing.price = existing.price ?? s.price;
      existing.cycle = existing.cycle ?? s.cycle;
      existing.next_renewal_date = existing.next_renewal_date ?? s.next_renewal_date;
      existing.last_charged = existing.last_charged ?? s.last_charged;
      if (!existing.plan_label && PLAN_HINT.test(s.name)) {
        existing.plan_label = s.name;
      }
      continue;
    }
    byKey.set(key, s);
    merged.push(s);
  }
  return merged;
}
