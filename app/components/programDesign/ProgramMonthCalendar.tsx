'use client';

import { WEEKDAY_LABELS } from '../../../lib/programDesign/types';
import type { TrainingMonthCell } from '../../../lib/programDesign/trainingSchedule';

type ProgramMonthCalendarProps = {
  monthLabel: string;
  monthCells: TrainingMonthCell[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
};

export default function ProgramMonthCalendar({
  monthLabel,
  monthCells,
  selectedDate,
  onSelectDate,
}: ProgramMonthCalendarProps) {
  return (
    <div className="te-month pd-month" role="grid" aria-label={`${monthLabel} program calendar`}>
      <div className="te-month-dows">
        {WEEKDAY_LABELS.map((dow) => (
          <span key={dow}>{dow}</span>
        ))}
      </div>
      <div className="te-month-grid">
        {monthCells.map((cell) => {
          const items = (cell.plan?.items || []).filter((item) => !item.isRest);
          const restOnly = (cell.plan?.items || []).length > 0 && items.length === 0;
          return (
            <button
              key={cell.date}
              type="button"
              className={[
                'te-month-cell',
                !cell.inMonth ? 'te-month-cell--out' : '',
                !cell.inProgram && items.length === 0 ? 'te-month-cell--off' : '',
                cell.plan?.isToday ? 'te-month-cell--today' : '',
                cell.date === selectedDate ? 'te-month-cell--selected' : '',
                restOnly ? 'pd-month-cell--rest' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(cell.date)}
              aria-label={cell.plan?.primary ? `${cell.date} ${cell.plan.primary.title}` : cell.date}
            >
              <span className="te-month-num">{Number(cell.date.slice(8, 10))}</span>
              <span className="te-month-dots" aria-hidden="true">
                {items.slice(0, 3).map((item) => (
                  <i key={item.id} className={`te-dot te-dot--${item.activityType || 'strength'}`} />
                ))}
              </span>
              {cell.plan?.primary && <span className="te-month-title">{cell.plan.primary.title}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
