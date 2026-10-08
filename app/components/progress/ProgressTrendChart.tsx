type ChartPoint = { date: string; value: number };

type ProgressTrendChartProps = {
  points: ChartPoint[];
  label: string;
  secondaryPoints?: ChartPoint[];
  reference?: number | null;
  /** Break the line when a calendar day is missing instead of treating it as zero. */
  gapDays?: boolean;
};

export default function ProgressTrendChart({ points, label, secondaryPoints, reference, gapDays = false }: ProgressTrendChartProps) {
  const plotted = points.filter((point) => Number.isFinite(point.value));
  if (plotted.length < 1) return null;
  if (plotted.length < 2 && !gapDays) return null;
  const width = 320;
  const height = 148;
  const all = plotted.concat(secondaryPoints || []);
  if (reference != null && Number.isFinite(reference)) all.push({ date: plotted[0].date, value: reference });
  const min = Math.min(...all.map((point) => point.value));
  const max = Math.max(...all.map((point) => point.value));
  const span = max - min || 1;
  const domain = dateDomain([...plotted, ...(secondaryPoints || [])].sort((a, b) => a.date.localeCompare(b.date)));
  const locate = (point: ChartPoint, index: number, series: ChartPoint[]) => {
    const x = gapDays ? dateX(point.date, domain, width) : indexX(index, series.length, width);
    const y = max === min ? height / 2 : height - 18 - ((point.value - min) / span) * (height - 36);
    return { x, y };
  };
  const primary = gapDays ? dateSegments(plotted) : [plotted];
  const secondary = secondaryPoints && secondaryPoints.length > 1 ? [secondaryPoints] : [];
  const start = plotted[0].value;
  const end = plotted[plotted.length - 1].value;
  const referenceY = reference == null ? null : locate({ date: plotted[0].date, value: reference }, 0, plotted).y;

  return (
    <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. Started at ${round(start)} and ended at ${round(end)}. Missing days are omitted.`}>
      {referenceY != null && (
        <line className="progress-chart-reference" x1="8" x2={width - 8} y1={referenceY} y2={referenceY} />
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

function dateX(date: string, domain: { start: number; end: number }, width: number): number {
  const time = Date.parse(`${date}T00:00:00Z`);
  return 8 + ((time - domain.start) / (domain.end - domain.start)) * (width - 16);
}

function indexX(index: number, count: number, width: number): number {
  if (count <= 1) return width / 2;
  return (index / (count - 1)) * (width - 16) + 8;
}

function round(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
