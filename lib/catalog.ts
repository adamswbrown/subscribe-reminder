import catalogData from "@/data/catalog.seed.json";

export interface CatalogPlan {
  label: string;
  typical_price: number;
  cycle?: string;
  seats?: number;
  screens?: number;
}

export interface CatalogService {
  id: string;
  name: string;
  category: string;
  domain?: string;
  default_cycle: string;
  typical_price?: number;
  plans?: CatalogPlan[];
  notice_period_days: number;
  cancel_method: string;
  typical_min_term_months?: number;
  notes?: string;
}

export const CATALOG: CatalogService[] = (
  catalogData as { services: CatalogService[] }
).services;

export const CATEGORY_LABELS: Record<string, string> = {
  streaming: "Streaming",
  music: "Music",
  news: "News & magazines",
  gaming: "Gaming",
  gym: "Gyms & fitness",
  broadband: "Broadband",
  mobile: "Mobile",
  utilities: "Household bills",
  storage: "Cloud storage",
  software: "Software & AI",
  books: "Books & audio",
  food: "Food & delivery",
  insurance: "Insurance",
  bundle: "Bundles",
  other: "Other",
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export function findService(id: string): CatalogService | undefined {
  return CATALOG.find((s) => s.id === id);
}
