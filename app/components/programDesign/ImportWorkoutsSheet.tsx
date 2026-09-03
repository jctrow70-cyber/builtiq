'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSourceWorkouts, importWorkoutsIntoActivities, type SourceWorkout } from '../../../lib/programDesign/importWorkouts';
import type { ProgramActivity } from '../../../lib/programDesign/types';

type ImportWorkoutsSheetProps = {
  supabase: SupabaseClient;
  userId: string;
  targetProgramId: string;
  strengthActivities: ProgramActivity[];
  onClose: () => void;
  onImported: () => void;
};

type ProgramOption = {
  id: string;
  name: string;
  status: string | null;
  weeks: number | null;
  workoutCount: number;
};

export default function ImportWorkoutsSheet({
  supabase,
  userId,
  targetProgramId,
  strengthActivities,
  onClose,
  onImported,
}: ImportWorkoutsSheetProps) {
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceWorkouts, setSourceWorkouts] = useState<SourceWorkout[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadPrograms();
  }, []);

  async function loadPrograms() {
    setLoading(true);
    const { data, error: loadErr } = await supabase
      .from('st_programs')
      .select('id, name, status, weeks, st_workouts(id)')
      .eq('owner_user_id', userId)
      .neq('id', targetProgramId)
      .order('created_at', { ascending: false });

    if (loadErr) {
      setError(loadErr.message);
      setLoading(false);
      return;
    }

    const options: ProgramOption[] = ((data || []) as any[])
      .filter((p) => (p.st_workouts || []).length > 0)
      .map((p) => ({
        id: p.id,
        name: p.name || 'Untitled program',
        status: p.status,
        weeks: p.weeks,
        workoutCount: (p.st_workouts || []).length,
      }));

    setPrograms(options);
    setLoading(false);
  }

  async function handleSelect(programId: string) {
    setSelectedId(programId);
    setLoadingSource(true);
    setError('');
    setSourceWorkouts([]);
    const { data, error: fetchErr } = await fetchSourceWorkouts(supabase, programId);
    setLoadingSource(false);
    if (fetchErr) {
      setError(fetchErr);
      return;
    }
    setSourceWorkouts(data);
  }

  async function handleImport() {
    if (!selectedId || !sourceWorkouts.length) return;
    setImporting(true);
    setError('');
    setSuccess('');
    const { imported, error: importErr } = await importWorkoutsIntoActivities(
      supabase,
      targetProgramId,
      strengthActivities,
      sourceWorkouts
    );
    setImporting(false);
    if (importErr) {
      setError(importErr);
      return;
    }
    setSuccess(`Imported exercises into ${imported} strength day${imported !== 1 ? 's' : ''}.`);
    setTimeout(() => {
      onImported();
    }, 1200);
  }

  const selected = programs.find((p) => p.id === selectedId);
  const availableWeeks = [...new Set(sourceWorkouts.map((w) => w.week))].sort((a, b) => a - b);
  const sourceWeek = availableWeeks[0] ?? 1;
  const week1 = sourceWorkouts.filter((w) => w.week === sourceWeek);
  const targetDayNames = strengthActivities
    .filter((a) => a.activity_type === 'strength')
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((a) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][a.day_of_week]);

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="pd-sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">Import exercises</p>
            <h2>Attach a strength program</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="muted">
          Pick an existing program with exercises. Its week 1 workouts will be copied into your
          strength days ({targetDayNames.join(', ') || 'none found'}).
        </p>

        {loading && <p className="muted">Loading your programs…</p>}

        {!loading && programs.length === 0 && (
          <p className="muted">
            No other programs with workouts found. Build a strength program in Training → Program Setup first,
            then come back to import it.
          </p>
        )}

        {!loading && programs.length > 0 && (
          <div className="import-program-list">
            {programs.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`import-program-option${selectedId === p.id ? ' active' : ''}`}
                onClick={() => void handleSelect(p.id)}
              >
                <b>{p.name}</b>
                <span className="muted">
                  {p.workoutCount} workout{p.workoutCount !== 1 ? 's' : ''}
                  {p.status ? ` · ${p.status}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {loadingSource && <p className="muted">Loading workouts…</p>}

        {selected && week1.length > 0 && !loadingSource && (
          <div className="import-preview">
            <h3>Week {sourceWeek} workouts from "{selected.name}"</h3>
            <div className="import-preview-list">
              {week1.map((w) => (
                <div key={w.id} className="import-preview-item">
                  <b>{w.day_label} — {w.workout_type || 'Workout'}</b>
                  <span className="muted">
                    {w.exercises.length} exercise{w.exercises.length !== 1 ? 's' : ''}
                  </span>
                  {w.exercises.slice(0, 4).map((ex) => (
                    <span key={ex.id} className="import-exercise-name">{ex.name}</span>
                  ))}
                  {w.exercises.length > 4 && (
                    <span className="muted">+{w.exercises.length - 4} more</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && week1.length === 0 && !loadingSource && (
          <p className="muted">This program has no workouts to import.</p>
        )}

        {error && <p className="pd-error">{error}</p>}
        {success && <p className="pd-success">{success}</p>}

        <div className="actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn green"
            disabled={!selectedId || !week1.length || importing || !!success}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importing…' : success ? 'Done!' : 'Import exercises into my strength days'}
          </button>
        </div>
      </div>
    </div>
  );
}
