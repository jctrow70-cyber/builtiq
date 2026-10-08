'use client';

import Card from '../ui/Card';
import type { ProgressReport } from '../../../lib/progress/report';
import {
  buildOverviewInsights,
  overviewCards,
  overviewSummary,
  type ProgressSection,
} from '../../../lib/progress/progressView';
import type { UnitsPreference } from '../../../lib/body/measurements';

type ProgressOverviewProps = {
  report: ProgressReport;
  units: UnitsPreference;
  onOpen: (section: ProgressSection) => void;
};

const CARD_LABEL: Record<ProgressSection, string> = {
  overview: 'Overview',
  strength: 'Strength',
  training: 'Training',
  nutrition: 'Nutrition',
  body: 'Body',
};

export default function ProgressOverview({ report, units, onOpen }: ProgressOverviewProps) {
  const summary = overviewSummary(report, units);
  const cards = overviewCards(report, units);
  const insights = buildOverviewInsights({
    strength: report.strengthIndex,
    muscles: report.muscles,
    nutrition: report.nutrition,
    body: report.body,
    units,
  });
  const limited = report.strengthIndex.confidence === 'estimated' || report.strengthIndex.confidence === 'mixed';

  return (
    <div className="progress-stack">
      <Card elevated>
        <p className="progress-kicker">Your progress</p>
        <h2 className="progress-headline">{summary.title}</h2>
        {summary.detail && <p className="progress-lead">{summary.detail}</p>}
        {summary.rows.length > 0 && (
          <div className="progress-summary-list">
            {summary.rows.map((row) => (
              <div className="progress-summary-row" key={row.label}>
                <span>{row.label}</span>
                <b>{row.value}</b>
              </div>
            ))}
          </div>
        )}
        {limited && report.strengthIndex.disclosure && (
          <details className="progress-note">
            <summary>Limited historical data</summary>
            <p>{report.strengthIndex.disclosure}</p>
          </details>
        )}
      </Card>

      <div className="progress-card-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="ui-card progress-nav-card"
            onClick={() => onOpen(card.id)}
            aria-label={cardAria(card.value, card.label, CARD_LABEL[card.id])}
          >
            <span className="progress-kicker">{CARD_LABEL[card.id]}</span>
            {card.value ? (
              <>
                <span className="progress-hero-value">{card.value}</span>
                <span className="progress-card-label">{card.label}</span>
                {card.lines.map((line) => (
                  <span className="muted progress-card-line" key={line}>{line}</span>
                ))}
              </>
            ) : (
              <>
                <span className="progress-card-label">{card.emptyTitle}</span>
                <span className="muted progress-card-line">{card.emptyBody}</span>
              </>
            )}
          </button>
        ))}
      </div>

      {insights.length > 0 && (
        <section className="progress-stack" aria-label="BuildIQ Insights">
          <h2 className="progress-section-title">BuildIQ Insights</h2>
          {insights.map((insight) => (
            <Card key={insight.id}>
              <h3 className="progress-insight-title">{insight.title}</h3>
              <p className="progress-lead">{insight.body}</p>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function cardAria(value: string | null, label: string, section: string): string {
  if (!value) return `${section}. Not enough data yet. Opens ${section}.`;
  return `${section}. ${value}. ${label}. Opens ${section}.`;
}
