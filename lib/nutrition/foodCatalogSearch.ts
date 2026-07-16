export type FoodCatalogItem = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  serving_label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_system?: boolean;
  is_archived?: boolean;
};

export function foodCatalogLabel(item: FoodCatalogItem): string {
  const brand = String(item.brand || '').trim();
  return brand ? `${item.name} (${brand})` : item.name;
}

export function foodCatalogMeta(item: FoodCatalogItem): string {
  const category = String(item.category || '').trim();
  const serving = String(item.serving_label || '1 serving').trim();
  const parts = [category, serving].filter(Boolean);
  return parts.join(' · ');
}

function searchScore(name: string, brand: string, query: string): number {
  if (!query) return 1;
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  if (name === query) score += 120;
  else if (name.startsWith(query)) score += 90;
  else if (name.includes(query)) score += 55;
  if (brand.includes(query)) score += 25;
  if (tokens.length > 1 && tokens.every((token) => name.includes(token) || brand.includes(token))) {
    score += 35;
  }
  return score;
}

export function searchFoodCatalog(items: FoodCatalogItem[], query: string, limit = 12): FoodCatalogItem[] {
  const q = query.trim().toLowerCase();
  const pool = (items || []).filter((item) => !item.is_archived);
  if (!q) return pool.slice(0, limit);
  return pool
    .map((item) => {
      const name = String(item.name || '').toLowerCase();
      const brand = String(item.brand || '').toLowerCase();
      return { item, score: searchScore(name, brand, q) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(a.item.name).localeCompare(String(b.item.name)))
    .slice(0, limit)
    .map((row) => row.item);
}

export function countFoodCatalogMatches(items: FoodCatalogItem[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return (items || []).filter((item) => !item.is_archived).length;
  return searchFoodCatalog(items, q, 9999).length;
}
