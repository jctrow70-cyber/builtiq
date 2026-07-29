'use client';

import { useState } from 'react';

type TrainingPlanSummaryProps = {
  programName: string | null;
  canManage?: boolean;
  onManageProgram?: () => void;
  infoDetail?: string;
};

export default function TrainingPlanSummary({
  programName,
  canManage,
  onManageProgram,
  infoDetail,
}: TrainingPlanSummaryProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="training-plan-summary">
      <div className="training-plan-summary-main">
        <div className="training-plan-summary-text">
          <p className="training-plan-eyebrow">Active plan</p>
          <h2 className="training-plan-title">{programName || 'No program yet'}</h2>
        </div>
        <div className="training-plan-summary-actions">
          {infoDetail && (
            <button
              type="button"
              className="training-plan-info-btn"
              aria-expanded={infoOpen}
              aria-label="More information"
              onClick={() => setInfoOpen((v) => !v)}
            >
              ⓘ
            </button>
          )}
          {canManage && onManageProgram && (
            <button type="button" className="btn small secondary" onClick={onManageProgram}>
              Manage
            </button>
          )}
        </div>
      </div>
      {infoOpen && infoDetail && (
        <p className="training-plan-info-detail">{infoDetail}</p>
      )}
    </div>
  );
}
