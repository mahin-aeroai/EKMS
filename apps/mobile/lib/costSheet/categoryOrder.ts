// Direct port of apps/web/src/app/workspaces/cost-sheet/categoryOrder.ts --
// see calc.ts in this same folder for why this is duplicated rather than
// imported from the web app.

export const COST_SHEET_CATEGORY_ORDER = [
  "Solvent",
  "UV",
  "Latex",
  "Dye-Sub",
  "Soft Signage",
  "Flag",
  "UV Rigid Board",
  "Window Blinds Printing Products",
] as const;

export function groupByCategory<T extends { category: string }>(rows: T[]): { category: string; items: T[] }[] {
  const byCategory = new Map<string, T[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  const ordered: { category: string; items: T[] }[] = [];
  for (const cat of COST_SHEET_CATEGORY_ORDER) {
    const items = byCategory.get(cat);
    if (items && items.length) {
      ordered.push({ category: cat, items });
      byCategory.delete(cat);
    }
  }
  // Anything not in the known list still shows up, just after the known ones.
  for (const [category, items] of byCategory) {
    ordered.push({ category, items });
  }
  return ordered;
}
