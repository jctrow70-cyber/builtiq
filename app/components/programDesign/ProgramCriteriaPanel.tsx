'use client';

import { describeGenerationCriteria, readGenerationCriteria } from '../../../lib/programDesign/generationCriteria';

export default function ProgramCriteriaPanel({ value }: { value: unknown }) {
  const criteria = readGenerationCriteria(value);
  if (!criteria) return null;
  const view = describeGenerationCriteria(criteria);

  return (
    <section className="pd-criteria" aria-label="Program criteria">
      <h3>Program criteria</h3>
      <p className="pd-criteria-status">{view.statusLabel}</p>
      {view.requestLines.length > 0 && (
        <>
          <h4>What you asked for</h4>
          <ul>
            {view.requestLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <h4>Requirements</h4>
      <ul>
        {view.requirementLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {view.kept.length > 0 && (
        <>
          <h4>Kept</h4>
          <ul>
            {view.kept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {view.unmet.length > 0 && (
        <>
          <h4>Could not meet</h4>
          <ul>
            {view.unmet.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
