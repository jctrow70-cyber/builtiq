type ProgressTrendChartProps = {
  points: { date: string; value: number }[];
  label: string;
};

export default function ProgressTrendChart({ points, label }: ProgressTrendChartProps) {
  if (points.length < 2) return null;
  const width = 320;
  const height = 148;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min || 1;
  const flat = max === min;
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * (width - 16) + 8;
    const y = flat ? height / 2 : height - 18 - ((point.value - min) / span) * (height - 36);
    return `${x},${y}`;
  });
  const start = points[0].value;
  const end = points[points.length - 1].value;

  return (
    <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. Started at ${round(start)} and ended at ${round(end)}.`}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={coords.join(' ')} />
    </svg>
  );
}

function round(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
