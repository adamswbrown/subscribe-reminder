// Client-side bank-CSV parsing and recurring-payment detection.
// Pure functions — the CSV never leaves the browser.

import { CATALOG } from "./catalog";
import type { ImportSuggestion } from "./importTypes";

interface Txn {
  date: Date;
  description: string;
  amount: number;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  // ISO: 2026-08-22
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // UK: 22/08/2026 or 22-08-26
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  }
  // 22 Aug 2026
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(s: string): number | null {
  const t = s.replace(/[£$,\s]/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function normalizeMerchant(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\b(DIRECT DEBIT|STANDING ORDER|CARD PAYMENT|DD|SO|CONTACTLESS|PAYMENT|REF|VIA|TO)\b/g, " ")
    .replace(/WWW\.|\.COM|\.CO\.UK|\.NET/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

export function matchCatalog(merchant: string): string | null {
  const upper = merchant.toUpperCase();
  for (const s of CATALOG) {
    const words = s.name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(" ")
      .filter((w) => w.length > 2);
    if (words.length > 0 && words.every((w) => upper.includes(w))) return s.id;
    if (s.domain) {
      const brand = s.domain.split(".")[0].toUpperCase();
      if (brand.length > 3 && upper.includes(brand)) return s.id;
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Rows → transactions. Header detection: find the columns whose values parse
 * as dates / amounts; the longest remaining text column is the description.
 */
export function extractTransactions(rows: string[][]): Txn[] {
  if (rows.length < 2) return [];
  const body = rows.slice(1);
  const cols = rows[0].length;
  let dateCol = -1;
  let amountCol = -1;
  let descCol = -1;

  const sample = body.slice(0, 20);
  let bestDateScore = 0;
  let bestAmountScore = 0;
  let bestDescLen = 0;
  for (let c = 0; c < cols; c++) {
    const dates = sample.filter((r) => r[c] && parseDate(r[c])).length;
    const amounts = sample.filter((r) => r[c] && parseAmount(r[c]) !== null && !parseDate(r[c])).length;
    const textLen = sample.reduce(
      (sum, r) => sum + ((r[c] && parseAmount(r[c]) === null && !parseDate(r[c])) ? r[c].length : 0),
      0
    );
    if (dates > bestDateScore) {
      bestDateScore = dates;
      dateCol = c;
    }
    if (amounts > bestAmountScore) {
      // Prefer a "money out"/debit column when the header hints at it
      const header = (rows[0][c] ?? "").toLowerCase();
      const bonus = /out|debit|paid/.test(header) ? 5 : 0;
      if (amounts + bonus > bestAmountScore) {
        bestAmountScore = amounts + bonus;
        amountCol = c;
      }
    }
    if (textLen > bestDescLen) {
      bestDescLen = textLen;
      descCol = c;
    }
  }
  if (dateCol < 0 || amountCol < 0 || descCol < 0) return [];

  const txns: Txn[] = [];
  for (const r of body) {
    const date = r[dateCol] ? parseDate(r[dateCol]) : null;
    const amount = r[amountCol] ? parseAmount(r[amountCol]) : null;
    const description = r[descCol]?.trim();
    if (date && amount !== null && amount !== 0 && description) {
      txns.push({ date, description, amount: Math.abs(amount) });
    }
  }
  return txns;
}

const CYCLES: Array<{ cycle: ImportSuggestion["cycle"]; min: number; max: number; days: number }> = [
  { cycle: "weekly", min: 5, max: 9, days: 7 },
  { cycle: "monthly", min: 26, max: 35, days: 30 },
  { cycle: "quarterly", min: 84, max: 98, days: 91 },
  { cycle: "yearly", min: 345, max: 385, days: 365 },
];

export function detectRecurring(rows: string[][]): ImportSuggestion[] {
  const txns = extractTransactions(rows);
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const key = normalizeMerchant(t.description);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const suggestions: ImportSuggestion[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < list.length; i++) {
      intervals.push(
        (list[i].date.getTime() - list[i - 1].date.getTime()) / 86400000
      );
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    const match = CYCLES.find((c) => median >= c.min && median <= c.max);
    if (!match) continue;

    const amounts = list.map((t) => t.amount);
    const latest = amounts[amounts.length - 1];
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (spread > Math.max(2, latest * 0.2)) continue;

    const last = list[list.length - 1].date;
    const next = new Date(last.getTime() + match.days * 86400000);
    suggestions.push({
      name: titleCase(merchant),
      catalog_id: matchCatalog(merchant),
      plan_label: null,
      price: latest,
      cycle: match.cycle,
      last_charged: last.toISOString().slice(0, 10),
      next_renewal_date: next.toISOString().slice(0, 10),
      category: null,
    });
  }
  return suggestions.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
}
