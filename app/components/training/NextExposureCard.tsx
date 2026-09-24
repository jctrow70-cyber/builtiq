'use client';

import type { AdaptationApplicationResult } from '../../../lib/scienceEngine/adaptation/apply/types';

type Props = {
  result: AdaptationApplicationResult;
};

export default function NextExposureCard({ result }: Props) {
  const silent = result.status === 'not_applied' && (result.decision === 'review_required' || result.decision === 'pain_hold' || result.decision === 'insufficient_data');
  return (
    <div className="card next-exposure-card">
      <div className="topline">
        <h3>Next time</h3>
      </div>
      <p className="next-exposure-headline">{result.explanation.headline}</p>
      {result.explanation.next_line ? <p className="next-exposure-delta">{result.explanation.next_line}</p> : null}
      <p className="muted" style={{ marginTop: 8 }}>
        <strong>Why:</strong> {result.explanation.why}
      </p>
      {silent ? <p className="muted">The next workout was not changed.</p> : null}
    </div>
  );
}
