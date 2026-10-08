import type { BodyMetricTrend } from './bodyTrends';
import type { NutritionReport } from './nutrition';
import type { StrengthIndexResult } from './strengthIndex';

export type ProgressAssociation = {
  id: string;
  text: string;
  claimsCausation: false;
};

export function progressAssociations(input: {
  strength: StrengthIndexResult;
  nutrition: NutritionReport;
  body: BodyMetricTrend[];
  trainingVolumeDelta: number | null;
}): ProgressAssociation[] {
  const notes: ProgressAssociation[] = [];
  const weight = input.body.find((metric) => metric.key === 'weight');
  const waist = input.body.find((metric) => metric.key === 'waist');
  const strength = input.strength.percentChange;
  if (strength != null && weight?.delta != null) {
    notes.push({
      id: 'strength-weight',
      claimsCausation: false,
      text: `During this period, strength ${direction(strength)} while body weight ${changePhrase(weight.delta, 'lb')}.`,
    });
  }
  if (waist?.delta != null && weight?.delta != null) {
    notes.push({
      id: 'waist-weight',
      claimsCausation: false,
      text: `During this period, waist ${changePhrase(waist.delta, 'in')} and body weight ${changePhrase(weight.delta, 'lb')}.`,
    });
  }
  if (input.nutrition.averages?.protein != null) {
    notes.push({
      id: 'protein',
      claimsCausation: false,
      text: `Protein averaged ${Math.round(input.nutrition.averages.protein)} g/day on days that were logged.`,
    });
  }
  if (input.nutrition.averages?.calories != null && input.trainingVolumeDelta != null) {
    notes.push({
      id: 'calories-volume',
      claimsCausation: false,
      text: `Logged days averaged ${Math.round(input.nutrition.averages.calories)} calories. That coincided with training volume ${direction(input.trainingVolumeDelta)}.`,
    });
  }
  return notes;
}

function direction(delta: number): string {
  if (Math.abs(delta) < 1) return 'stayed relatively stable';
  return delta > 0 ? `increased ${Math.abs(delta).toFixed(1)}%` : `decreased ${Math.abs(delta).toFixed(1)}%`;
}

function changePhrase(delta: number, unit: string): string {
  if (Math.abs(delta) < 0.3) return 'remained relatively stable';
  const signed = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${unit}`;
  return delta > 0 ? `increased (${signed})` : `decreased (${signed})`;
}
