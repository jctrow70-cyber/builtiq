'use client';

import { groupSectionBlocks } from '../../../lib/training/workoutTemplate';
import {
  exerciseRestLabel,
  groupedPreviewSections,
  summarizeExerciseParts,
} from '../../../lib/programDesign/workoutPreview';

export default function WorkoutPreview({ workout }: { workout: any }) {
  const sections = groupedPreviewSections(workout);
  if (!sections.length) return <p className="muted">No exercises on this day yet.</p>;
  return (
    <div className="pd-workout-body">
      {sections.map((sec) => {
        const blocks = groupSectionBlocks(sec.list);
        return (
          <section key={sec.id} className="te-plan-section">
            <h3>{sec.label}</h3>
            {blocks.map((block) => {
              const items = block.exercises || [];
              return (
                <div
                  key={block.groupId || items[0]?.id || sec.id}
                  className={block.type === 'superset' ? 'pd-preview-superset' : undefined}
                >
                  {block.type === 'superset' && <p className="pd-preview-superset-label">{block.label}</p>}
                  {items.map((ex: any) => {
                    const summary = summarizeExerciseParts(ex);
                    const rest = exerciseRestLabel(ex);
                    return (
                      <div key={ex.id} className="te-plan-ex">
                        <b>{ex.name}</b>
                        <span>
                          {ex.muscle_group ? `${ex.muscle_group} · ` : ''}
                          {summary.primary}
                        </span>
                        {summary.extras.map((line) => (
                          <span key={line} className="muted">
                            {line}
                          </span>
                        ))}
                        {rest && <span className="muted">{rest}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
