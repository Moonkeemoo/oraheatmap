// Maps backend's 8+Other categories to the visual identity from
// Reference/data.js. Backend categories that don't exist in Reference
// (Tech / World / Other) get colors matching their nearest semantic neighbor.

import type { Category } from "./types";

export type CategoryMeta = { id: Category; label: string; color: string };

export const CATEGORY_META: ReadonlyArray<CategoryMeta> = Object.freeze([
  { id: "Sports", label: "SPORTS", color: "#f85149" }, // Reference Sports red
  { id: "Politics", label: "POLITICS", color: "#1f6feb" }, // Reference Politics blue
  { id: "Crypto", label: "CRYPTO", color: "#f0b429" }, // Reference Crypto yellow
  { id: "Finance", label: "FINANCE", color: "#39d2c0" }, // Reference Finance teal
  { id: "Tech", label: "TECH", color: "#3fb950" }, // Reference Science green (closest)
  { id: "World", label: "WORLD", color: "#58a6ff" }, // Reference link blue
  { id: "Culture", label: "CULTURE", color: "#a371f7" }, // Reference Culture purple
  { id: "Climate", label: "CLIMATE", color: "#768390" }, // Reference Weather gray
  { id: "Other", label: "OTHER", color: "#5d6166" }, // dim gray for fallback bucket
]);

const META_BY_ID = new Map(CATEGORY_META.map((m) => [m.id, m]));
export function categoryMeta(id: Category): CategoryMeta {
  return META_BY_ID.get(id) ?? CATEGORY_META[CATEGORY_META.length - 1]!;
}
