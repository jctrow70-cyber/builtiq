type ChartPoint = { date: string; value: number };

type ProgressTrendChartProps = {
  points: ChartPoint[];
  label: string;
  secondaryPoints?: ChartPoint[];
  reference?: number | null;
  /** Break the line when a calendar day is missing instead of treating it as zero. */
  gapDays?: boolean;
  /** Explicit vertical range. Keeps small changes visible without starting at zero. */
  domain?: { min: number; max: number } | null;
  formatValue?: (value: number) => string;
  showDates?: boolean;
};

export default function ProgressTrendChart({ points, label, secondaryPoints, reference, gapDays = false, domain, formatValue, showDates = false }: ProgressTrendChartProps) {
  const plotted = points.filter((point) => Number.isFinite(point.value));
  if (plotted.length < 1) return null;
  if (plotted.length < 2 && !gapDays && !showDates) return null;
  const width = 320;
  const height = showDates ? 188 : 148;
  const all = plotted.concat(secondaryPoints || []);
  if (reference != null && Number.isFinite(reference)) all.push({ date: plotted[0].date, value: reference });
  const min = domain?.min ?? Math.min(...all.map((point) => point.value));
  const max = domain?.max ?? Math.max(...all.map((point) => point.value));
  const span = max - min || 1;
  const plotBottom = showDates ? height - 36 : height - 18;
  const plotTop = 16;
  const left = showDates ? 64 : 8;
  const right = 8;
  const dates = dateDomain([...plotted, ...(secondaryPoints || [])].sort((a, b) => a.date.localeCompare(b.date)));
  const locate = (point: ChartPoint, index: number, series: ChartPoint[]) => {
    const x = gapDays ? dateX(point.date, dates, width, left, right) : indexX(index, series.length, width, left, right);
    const y = max === min ? (plotTop + plotBottom) / 2 : plotBottom - ((point.value - min) / span) * (plotBottom - plotTop);
    return { x, y };
  };
  const primary = gapDays ? dateSegments(plotted) : [plotted];
  const secondary = secondaryPoints && secondaryPoints.length > 1 ? [secondaryPoints] : [];
  const start = plotted[0].value;
  const end = plotted[plotted.length - 1].value;
  const referenceY = reference == null ? null : locate({ date: plotted[0].date, value: reference }, 0, plotted).y;

  return (
    <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. Started at ${round(start)} and ended at ${round(end)}. Missing days are omitted.`}>
      {showDates && (
        <>
          <text className="progress-chart-label" x="4" y="12">{formatValue ? formatValue(max) : round(max)}</text>
          <text className="progress-chart-label" x="4" y={plotBottom}>{formatValue ? formatValue(min) : round(min)}</text>
          <text className="progress-chart-label" x={left} y={height - 8}>{shortDate(plotted[0].date)}</text>
          <text className="progress-chart-label" x={width - right} y={height - 8} textAnchor="end">{shortDate(plotted[plotted.length - 1].date)}</text>
        </>
      )}
      {referenceY != null && (
        <line className="progress-chart-reference" x1={left} x2={width - right} y1={referenceY} y2={referenceY} />
      )}
      {secondary.map((segment, index) => (
        <polyline key={`s-${index}`} className="progress-chart-secondary" fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={segment.map((point, pointIndex) => {
          const spot = locate(point, pointIndex, segment);
          return `${spot.x},${spot.y}`;
        }).join(' ')} />
      ))}
      {primary.map((segment, index) => {
        if (segment.length === 1) {
          const spot = locate(segment[0], plotted.indexOf(segment[0]), plotted);
          return <circle key={`p-${index}`} className="progress-chart-point" cx={spot.x} cy={spot.y} r="3" />;
        }
        return (
          <polyline key={`p-${index}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={segment.map((point) => {
            const spot = locate(point, plotted.indexOf(point), plotted);
            return `${spot.x},${spot.y}`;
          }).join(' ')} />
        );
      })}
    </svg>
  );
}

function dateSegments(points: ChartPoint[]): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  points.forEach((point) => {
    const current = segments[segments.length - 1];
    const previous = current?.[current.length - 1];
    if (!previous || dayGap(previous.date, point.date) <= 1) {
      if (!current) segments.push([point]);
      else current.push(point);
      return;
    }
    segments.push([point]);
  });
  return segments;
}

function dayGap(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.round((end - start) / 86400000);
}

function dateDomain(points: ChartPoint[]): { start: number; end: number } {
  const start = Date.parse(`${points[0].date}T00:00:00Z`);
  const end = Date.parse(`${points[points.length - 1].date}T00:00:00Z`);
  return { start, end: end > start ? end : start + 86400000 };
}

function dateX(date: string, domain: { start: number; end: number }, width: number, left = 8, right = 8): number {
  const time = Date.parse(`${date}T00:00:00Z`);
  return left + ((time - domain.start) / (domain.end - domain.start)) * (width - left - right);
}

function indexX(index: number, count: number, width: number, left = 8, right = 8): number {
  if (count <= 1) return (left + width - right) / 2;
  return (index / (count - 1)) * (width - left - right) + left;
}

function shortDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function round(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
