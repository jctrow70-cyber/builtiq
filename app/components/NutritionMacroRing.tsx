'use client';

import { macroRingArc, macroRingStatus } from '../../lib/nutrition/macroRing';

type NutritionMacroRingProps = {
  label: string;
  value: string;
  subtitle: string;
  footer?: string;
  actual: number;
  target: number;
};

const RING_SIZE = 120;
const STROKE = 9;

export default function NutritionMacroRing({
  label,
  value,
  subtitle,
  footer,
  actual,
  target,
}: NutritionMacroRingProps) {
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = macroRingArc(actual, target);
  const offset = circumference * (1 - arc);
  const status = macroRingStatus(actual, target);

  return (
    <div className="nutrition-macro-ring-cell">
      <span className="nutrition-macro-ring-label">{label}</span>
      <div className={`nutrition-macro-ring-wrap nutrition-ring--${status}`}>
        <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
          <circle
            className="nutrition-ring-track"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            strokeWidth={STROKE}
          />
          <circle
            className="nutrition-ring-progress"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </svg>
        <div className="nutrition-macro-ring-center">
          <span className="nutrition-macro-ring-value">{value}</span>
          <span className="nutrition-macro-ring-subtitle">{subtitle}</span>
          {footer ? <span className="nutrition-macro-ring-footer">{footer}</span> : null}
        </div>
      </div>
    </div>
  );
}
