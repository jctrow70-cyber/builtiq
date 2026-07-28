'use client';

import { useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import StatItem from '../ui/StatItem';
import DateInput from '../DateInput';
import {
  dateForWeekAndDay,
  dayLabelFromYmd,
  formatDisplayDate,
  resolveProgramStartDate,
  weekRangeLabel,
} from '../../../lib/training/programCalendar';

type ActivePlanCardProps = {
  programName: string | null;
  programBadge: string;
  groupName: string | null;
  groups: { id: string; name: string }[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  trainingSource: 'team' | 'personal';
  onTrainingSourceChange: (source: 'team' | 'personal') => void;
  planStatLabel: string;
  week: number;
  plannedSets: number;
  loggedSets: number;
  showDetailedStats: boolean;
  logDate: string;
  onLogDateChange: (value: string) => void;
  onWeekChange: (week: number) => void;
  weekOptions: { value: number; label: string }[];
  programStartDate?: string;
  onProgramStartDateChange?: (value: string) => void;
  canEditProgramStart?: boolean;
  dateDisabled?: boolean;
  weekDisabled?: boolean;
  helperDetail?: string;
  onManageProgram?: () => void;
  canManageProgram?: boolean;
  hasGroups?: boolean;
};

export default function ActivePlanCard({
  programName,
  programBadge,
  groupName,
  groups,
  selectedGroupId,
  onSelectGroup,
  trainingSource,
  onTrainingSourceChange,
  planStatLabel,
  week,
  plannedSets,
  loggedSets,
  showDetailedStats,
  logDate,
  onLogDateChange,
  onWeekChange,
  weekOptions,
  programStartDate,
  onProgramStartDateChange,
  canEditProgramStart,
  dateDisabled,
  weekDisabled,
  helperDetail,
  onManageProgram,
  canManageProgram,
  hasGroups = true,
}: ActivePlanCardProps) {
  const [helperOpen, setHelperOpen] = useState(false);
  const hasMultipleGroups = groups.length > 1;
  const helperText =
    programName && groupName && trainingSource === 'team'
      ? `Logging the ${groupName} ${programName}.`
      : programName
        ? `Logging ${programName}.`
        : 'Ready when you are — set up or select a program to start.';

  return (
    <Card className="active-plan-card" elevated>
      <div className="active-plan-head">
        <div>
          <p className="active-plan-eyebrow">Active plan</p>
          <h2 className="active-plan-title">{programName || 'No program selected'}</h2>
        </div>
        <div className="active-plan-head-actions">
          <span className="ui-badge">{programBadge}</span>
          {canManageProgram && onManageProgram && (
            <button type="button" className="btn small secondary" onClick={onManageProgram}>
              Manage program
            </button>
          )}
        </div>
      </div>

      {groupName && hasGroups && (
        hasMultipleGroups ? (
          <button
            type="button"
            className="active-plan-group-row"
            onClick={() => {
              const idx = groups.findIndex((g) => g.id === selectedGroupId);
              const next = groups[(idx + 1) % groups.length];
              if (next) onSelectGroup(next.id);
            }}
            aria-label="Switch group"
          >
            <span className="active-plan-group-icon" aria-hidden="true">👥</span>
            <span className="active-plan-group-name">{groupName}</span>
            <span className="active-plan-group-chevron" aria-hidden="true">›</span>
          </button>
        ) : (
          <div className="active-plan-group-row active-plan-group-row--static">
            <span className="active-plan-group-icon" aria-hidden="true">👥</span>
            <span className="active-plan-group-name">{groupName}</span>
          </div>
        )
      )}

      {hasGroups && (
      <SegmentedControl
        ariaLabel="Workout type"
        value={trainingSource === 'personal' ? 'personal' : 'group'}
        onChange={(v) => onTrainingSourceChange(v === 'personal' ? 'personal' : 'team')}
        options={[
          { value: 'group', label: 'Group workout' },
          { value: 'personal', label: 'Personal plan' },
        ]}
        size="sm"
      />
      )}

      <div className="active-plan-helper">
        <p className="active-plan-helper-text">{helperText}</p>
        {helperDetail && (
          <button
            type="button"
            className="active-plan-info-btn"
            aria-expanded={helperOpen}
            aria-label="More information"
            onClick={() => setHelperOpen((v) => !v)}
          >
            ⓘ
          </button>
        )}
      </div>
      {helperOpen && helperDetail && (
        <p className="active-plan-helper-detail">{helperDetail}</p>
      )}

      <div className="active-plan-stats" role="list" aria-label="Plan summary">
        <StatItem label="Plan" value={planStatLabel} />
        <StatItem label="Week" value={week} />
        {showDetailedStats && (
          <>
            <StatItem label="Sets" value={plannedSets} />
            <StatItem label="Logged" value={loggedSets} />
          </>
        )}
        {!showDetailedStats && (
          <StatItem label="Logged" value={`${loggedSets} sets`} />
        )}
      </div>

      <div className="active-plan-controls">
        <div className="active-plan-control">
          <label htmlFor="training-log-date">Date</label>
          <DateInput
            id="training-log-date"
            value={logDate}
            onChange={onLogDateChange}
            disabled={dateDisabled}
          />
        </div>
        <div className="active-plan-control active-plan-control--week">
          <label htmlFor="training-week">Week</label>
          <select
            id="training-week"
            value={week}
            onChange={(e) => onWeekChange(Number(e.target.value))}
            disabled={weekDisabled}
          >
            {weekOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {programStartDate && onProgramStartDateChange && (
          <div className="active-plan-control">
            <label htmlFor="program-start">Start</label>
            <DateInput
              id="program-start"
              value={programStartDate}
              onChange={onProgramStartDateChange}
              disabled={!canEditProgramStart}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

export function activePlanWeekOptions(program: any, weeksFallback: number) {
  const total = program?.weeks || weeksFallback || 6;
  const start = program ? resolveProgramStartDate(program) : '';
  return Array.from({ length: total }, (_, i) => {
    const w = i + 1;
    return {
      value: w,
      label: start
        ? `Wk ${w} · ${weekRangeLabel(start, w)}`
        : `Week ${w}`,
    };
  });
}

export function trainingLogContextLine(program: any, week: number, logDate: string) {
  if (!program) return '';
  const start = resolveProgramStartDate(program);
  return `Week ${week} covers ${weekRangeLabel(start, week)}. Logging on ${formatDisplayDate(logDate)} (${dayLabelFromYmd(logDate)}).`;
}

export { dateForWeekAndDay, resolveProgramStartDate, formatDisplayDate };
