'use client';

import type { AdaptationOrchestrationResult } from '../../../lib/training/adaptationOrchestration';

type Props = {
  result: AdaptationOrchestrationResult;
};

export default function AdaptationSummaryCard({ result }: Props) {
  return (
    <div className="card adaptation-summary-card">
      <div className="topline">
        <h3>Next session</h3>
      </div>
      <p className="adaptation-summary-headline">{result.summary}</p>
      {result.triggered ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Evaluated {result.evaluated} · Updated {result.updated} · Held {result.held} · Review {result.review}
          {result.failed ? ` · Failed ${result.failed}` : ''}
          {result.already_applied ? ` · Already applied ${result.already_applied}` : ''}
        </p>
      ) : null}
      {result.limitation ? <p className="muted">{result.limitation}</p> : null}
      {result.pending_retry || result.error ? (
        <p className="muted">Your workout is still saved. BuiltIQ can retry adaptation without doubling changes.</p>
      ) : null}
    </div>
  );
}
