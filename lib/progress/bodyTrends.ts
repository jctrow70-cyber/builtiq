import { readBodyMeasurement, BODY_MEASUREMENT_DEFINITIONS, type BodyMeasurementKey, type BodyMeasurementRow } from '../body/measurements';
import { inSpan, type DateSpan } from './ranges';

export type BodyMetricTrend = {
  key: BodyMeasurementKey;
  label: string;
  samples: number;
  first: number | null;
  last: number | null;
  delta: number | null;
  /** Trailing mean of up to four check-ins. Null until three samples exist. */
  rollingAverage: number | null;
  raw: { date: string; value: number }[];
};

export function bodyTrends(rows: BodyMeasurementRow[], span: DateSpan): BodyMetricTrend[] {
  const inRange = rows
    .filter((row) => inSpan(row.measured_on, span))
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  return BODY_MEASUREMENT_DEFINITIONS.map((definition) => {
    const raw = inRange
      .map((row) => {
        const value = readBodyMeasurement(row, definition.key);
        return value == null ? null : { date: row.measured_on, value };
      })
      .filter((point): point is { date: string; value: number } => !!point);
    const first = raw[0]?.value ?? null;
    const last = raw[raw.length - 1]?.value ?? null;
    const trailing = raw.slice(-4).map((point) => point.value);
    return {
      key: definition.key,
      label: definition.label,
      samples: raw.length,
      first,
      last,
      delta: first == null || last == null ? null : round1(last - first),
      rollingAverage: raw.length >= 3 ? round1(trailing.reduce((sum, value) => sum + value, 0) / trailing.length) : null,
      raw,
    };
  }).filter((trend) => trend.samples > 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
