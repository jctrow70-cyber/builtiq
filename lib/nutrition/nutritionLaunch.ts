export type NutritionAddLaunch = {
  id: number;
  openAdd: true;
};

/** Open Add Food once per launch id. A later Nutrition visit does not reuse an old id. */
export function shouldOpenNutritionAdd(launch: NutritionAddLaunch | null | undefined, consumedId: number | null): boolean {
  if (!launch?.openAdd) return false;
  return consumedId !== launch.id;
}
