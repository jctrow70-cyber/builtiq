'use client';

import { groupSectionBlocks } from '../../../lib/training/workoutTemplate';
import { getExerciseGuidePayload, getExerciseThumb, hasExerciseGuide } from '../../../lib/training/exerciseMedia';
import {
  blockRestLabel,
  exerciseEquipmentLabel,
  exerciseNoteText,
  exerciseRestLabel,
  exerciseTempoLabel,
  groupedPreviewSections,
  rampSetDetails,
  summarizeExerciseParts,
  supersetMarks,
} from '../../../lib/programDesign/workoutPreview';

function catalogItemFor(ex: any, catalog: any[]) {
  if (!ex?.catalog_exercise_id) return null;
  return catalog.find((item) => item.id === ex.catalog_exercise_id) || null;
}

function ExerciseRow({
  ex,
  catalog,
  mark,
}: {
  ex: any;
  catalog: any[];
  mark?: string;
}) {
  const item = catalogItemFor(ex, catalog);
  const summary = summarizeExerciseParts(ex);
  const rest = exerciseRestLabel(ex);
  const equipment = exerciseEquipmentLabel(ex, item);
  const tempo = exerciseTempoLabel(ex);
  const note = exerciseNoteText(ex);
  const ramps = rampSetDetails(ex);
  const guide = item && hasExerciseGuide(item) ? getExerciseGuidePayload(item, ex.name) : null;
  const thumb = item ? getExerciseThumb(item) : '';
  const mediaHref = guide?.embedUrl || guide?.videoUrl || '';
  const extras = [tempo ? `Tempo ${tempo}` : '', note].filter(Boolean);
  const hasMore = ramps.length > 0 || extras.length > 0 || Boolean(guide?.instructions);

  return (
    <article className="pd-ex">
      <div className="pd-ex-main">
        <div className="pd-ex-copy">
          <h4>
            {mark ? <span className="pd-ex-mark">{mark}</span> : null}
            {ex.name}
          </h4>
          {equipment ? <p className="pd-ex-equipment">{equipment}</p> : null}
          <p className="pd-ex-rx">{summary.primary}</p>
          {summary.extras.map((line) => (
            <p key={line} className="pd-ex-secondary">
              {line}
            </p>
          ))}
          {rest && !mark ? <p className="pd-ex-meta">{rest}</p> : null}
        </div>
        {thumb ? (
          mediaHref ? (
            <a className="pd-ex-media" href={mediaHref} target="_blank" rel="noreferrer">
              <img src={thumb} alt="" />
              <span>Form</span>
            </a>
          ) : (
            <span className="pd-ex-media">
              <img src={thumb} alt="" />
            </span>
          )
        ) : null}
      </div>
      {hasMore ? (
        <details className="pd-ex-more">
          <summary>More details</summary>
          {ramps.length > 0 ? (
            <ul>
              {ramps.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {extras.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {guide?.instructions ? <p>{guide.instructions}</p> : null}
        </details>
      ) : null}
    </article>
  );
}

export default function WorkoutPreview({ workout, catalog = [] }: { workout: any; catalog?: any[] }) {
  const sections = groupedPreviewSections(workout);
  if (!sections.length) return <p className="muted">No exercises on this day yet.</p>;

  return (
    <div className="pd-detail-body">
      {sections.map((sec) => {
        const blocks = groupSectionBlocks(sec.list);
        return (
          <section key={sec.id} className="pd-detail-section">
            <h3>{sec.label}</h3>
            {blocks.map((block) => {
              const items = block.exercises || [];
              if (block.type === 'superset') {
                const marks = supersetMarks(block.label, items.length);
                const pairRest = blockRestLabel(items);
                return (
                  <div key={block.groupId || items[0]?.id} className="pd-superset">
                    <p className="pd-superset-label">{block.label}</p>
                    {items.map((ex: any, index: number) => (
                      <ExerciseRow key={ex.id} ex={ex} catalog={catalog} mark={marks[index]} />
                    ))}
                    {pairRest ? <p className="pd-superset-rest">Rest: {pairRest.replace(' rest', '')} after the pair</p> : null}
                  </div>
                );
              }
              return items.map((ex: any) => <ExerciseRow key={ex.id} ex={ex} catalog={catalog} />);
            })}
          </section>
        );
      })}
    </div>
  );
}
