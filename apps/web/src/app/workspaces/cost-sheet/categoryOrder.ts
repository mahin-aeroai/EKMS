// Fixed display order for the 8 Cost Sheet product-category buckets, same
// grouping/order as the original "Product Categories" reference sheet
// (Solvent / UV / Latex / Dye-Sublimation / Soft Signage / Flag / UV Rigid
// Board / Window Blinds Products) -- see
// supabase-cost-sheet-category-consolidation-migration.sql for the code
// -> category backfill this depends on.
export const COST_SHEET_CATEGORY_ORDER = [
  "Solvent Printing Products",
  "UV Printing Products",
  "Latex Printing Products",
  "Dye-Sublimation Printing Products",
  "Soft Signage Products",
  "Flag Products",
  "UV Rigid Board Printing Products",
  "Window Blinds",
] as const;

export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

// Groups items by their `category` field, in COST_SHEET_CATEGORY_ORDER --
// any category not in that list (e.g. a new template added before its
// category gets classified) is appended at the end, alphabetically, so it
// still shows up rather than silently vanishing from the grouped view.
export function groupByCategory<T extends { category: string }>(items: T[]): CategoryGroup<T>[] {
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const ordered: CategoryGroup<T>[] = [];
  for (const category of COST_SHEET_CATEGORY_ORDER) {
    const list = byCategory.get(category);
    if (list) {
      ordered.push({ category, items: list });
      byCategory.delete(category);
    }
  }
  for (const [category, items] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    ordered.push({ category, items });
  }
  return ordered;
}
