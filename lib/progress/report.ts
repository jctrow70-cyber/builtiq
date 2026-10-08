import { mondayOfWeek } from '../training/programCalendar';
import { progressAdherence, type ProgressAdherence } from './adherence';
import { progressAssociations, type ProgressAssociation } from './associations';
import { bodyTrends, type BodyMetricTrend } from './bodyTrends';
import type { BodyMeasurementRow } from '../body/measurements';
import { nutritionDaysFromEntries, nutritionReport, type NutritionReport, type NutritionTargets } from './nutrition';
import { comparableWindows, earliestIsoDate, rangeBounds, type DateSpan, type ProgressRange } from './ranges';
import { isCountedWorkingSet, setFactFromRow, type ProgressSetFact } from './setFacts';
import { buildSeriesWindows, seriesPersonalRecords, type SeriesPr, type SeriesWindows } from './strengthSeries';
import { buildStrengthIndex, type StrengthIndexConfig, type StrengthIndexResult } from './strengthIndex';
import { muscleVolumeReport, type MuscleVolumeReport } from './muscleVolume';
import type { ExpectationFact } from '../training/unifiedSchedule';

export type ProgressReportInput = {
  range: ProgressRange;
  today: string;
  setRows?: any[];
  facts?: ProgressSetFact[];
  mealEntries?: Array<{ log_date?: string; calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }>;
  nutritionTargets?: NutritionTargets | null;
  measurements?: BodyMeasurementRow[];
  expectations?: ExpectationFact[] | null;
  strengthIndex?: StrengthIndexConfig;
};

export type ProgressReport = {
  range: ProgressRange;
  today: string;
  view: DateSpan;
  windows: ReturnType<typeof comparableWindows>;
  series: SeriesWindows[];
  personalRecords: SeriesPr[];
  strengthIndex: StrengthIndexResult;
  muscles: MuscleVolumeReport;
  nutrition: NutritionReport;
  body: BodyMetricTrend[];
  adherence: ProgressAdherence | null;
  associations: ProgressAssociation[];
  trainingVolume: number;
  previousTrainingVolume: number | null;
  /** Distinct dates with a counted working set in the selected range. */
  loggedTrainingDays: number;
};

export function buildProgressReport(input: ProgressReportInput): ProgressReport {
  const facts = input.facts || (input.setRows || []).map(setFactFromRow);
  const dates = facts.map((fact) => fact.logDate);
  (input.measurements || []).forEach((row) => dates.push(row.measured_on));
  const view = rangeBounds(input.range, input.today, earliestIsoDate(dates));
  const windows = comparableWindows(view);
  const series = buildSeriesWindows(facts, view, windows.baseline, windows.current, mondayOfWeek);
  const strengthIndex = buildStrengthIndex(series, input.strengthIndex);
  const viewFacts = facts.filter((fact) => fact.logDate >= view.from && fact.logDate <= view.to);
  const nutrition = nutritionReport(nutritionDaysFromEntries(input.mealEntries || []), view, input.nutritionTargets);
  const body = bodyTrends(input.measurements || [], view);
  const muscles = muscleVolumeReport(facts, view);
  const trainingVolume = series.reduce((sum, item) => sum + item.viewVolume, 0);
  const previousTrainingVolume = windows.mode === 'previous_window'
    ? volumeInSpan(facts, windows.baseline)
    : null;
  const adherence = progressAdherence(input.expectations, input.today);
  const volumeDelta =
    previousTrainingVolume != null && previousTrainingVolume > 0
      ? Math.round(((trainingVolume - previousTrainingVolume) / previousTrainingVolume) * 1000) / 10
      : null;

  return {
    range: input.range,
    today: input.today,
    view,
    windows,
    series,
    personalRecords: seriesPersonalRecords(viewFacts),
    strengthIndex,
    muscles,
    nutrition,
    body,
    adherence,
    associations: progressAssociations({
      strength: strengthIndex,
      nutrition,
      body,
      trainingVolumeDelta: volumeDelta,
    }),
    trainingVolume,
    previousTrainingVolume,
    loggedTrainingDays: new Set(viewFacts.filter(isCountedWorkingSet).map((fact) => fact.logDate)).size,
  };
}

function volumeInSpan(facts: ProgressSetFact[], span: DateSpan): number {
  return buildSeriesWindows(facts, span, span, span, mondayOfWeek).reduce((sum, item) => sum + item.viewVolume, 0);
}
