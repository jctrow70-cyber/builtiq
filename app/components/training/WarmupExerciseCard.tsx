'use client';

type PlannedSet = {
  set_number: number;
  target_reps?: string;
  target_weight?: string;
};

type Props = {
  name: string;
  sets: PlannedSet[];
  thumbUrl?: string | null;
  showGuide?: boolean;
  guideLabel?: string;
  onOpenGuide?: () => void;
  canEdit?: boolean;
  onChange?: () => void;
  onAddSet?: () => void;
  onRemove?: () => void;
};

export function formatWarmupPrescription(sets: PlannedSet[]): string {
  if (!sets.length) return 'No sets programmed';
  const count = sets.length;
  const repsList = sets.map((s) => String(s.target_reps || '').trim()).filter(Boolean);
  const weightList = sets.map((s) => String(s.target_weight || '').trim()).filter(Boolean);
  const uniqueReps = [...new Set(repsList)];
  const uniqueWeight = [...new Set(weightList)];

  if (uniqueReps.length === 1 && !uniqueWeight.length) {
    return `${count} set${count === 1 ? '' : 's'} · ${uniqueReps[0]}`;
  }
  if (uniqueReps.length === 1 && uniqueWeight.length === 1) {
    return `${count} set${count === 1 ? '' : 's'} · ${uniqueReps[0]}${uniqueWeight[0] ? ` @ ${uniqueWeight[0]}` : ''}`;
  }
  return sets
    .map((s) => {
      const parts = [s.target_reps, s.target_weight]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      return parts.length ? `Set ${s.set_number}: ${parts.join(' · ')}` : `Set ${s.set_number}`;
    })
    .join(' · ');
}

export default function WarmupExerciseCard({
  name,
  sets,
  thumbUrl,
  showGuide,
  guideLabel,
  onOpenGuide,
  canEdit,
  onChange,
  onAddSet,
  onRemove,
}: Props) {
  const guideAction = showGuide && onOpenGuide;

  return (
    <div className="card warmup-exercise-card">
      <div className="warmup-exercise-main">
        {thumbUrl ? (
          guideAction ? (
            <button
              type="button"
              className="warmup-exercise-thumb-btn"
              onClick={onOpenGuide}
              title={guideLabel}
            >
              <img
                className="warmup-exercise-thumb"
                src={thumbUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          ) : (
            <img
              className="warmup-exercise-thumb warmup-exercise-thumb--static"
              src={thumbUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )
        ) : null}
        <div className="warmup-exercise-body">
          <h3 className="warmup-exercise-name">{name}</h3>
          <p className="warmup-exercise-prescription">{formatWarmupPrescription(sets)}</p>
        </div>
        {guideAction && (
          <button type="button" className="btn small secondary warmup-exercise-guide-btn" onClick={onOpenGuide}>
            {guideLabel || 'Form guide'}
          </button>
        )}
      </div>
      {canEdit && (onChange || onAddSet || onRemove) && (
        <div className="warmup-exercise-actions actions">
          {onChange && (
            <button type="button" className="btn small secondary" onClick={onChange}>
              Change
            </button>
          )}
          {onAddSet && (
            <button type="button" className="btn small secondary" onClick={onAddSet}>
              + Set
            </button>
          )}
          {onRemove && (
            <button type="button" className="btn small red" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
