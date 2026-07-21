'use client';

import { useState } from 'react';
import type { GroupClassification } from '../../../lib/groups';
import { countMembersInClassification } from '../../../lib/groups/classifications';

type GroupClassificationsPanelProps = {
  classifications: GroupClassification[];
  members: any[];
  memberClassificationIds: Record<string, string[]>;
  onCreate: (name: string) => Promise<void>;
  onDelete: (classification: GroupClassification) => Promise<void>;
};

export default function GroupClassificationsPanel({
  classifications,
  members,
  memberClassificationIds,
  onCreate,
  onDelete,
}: GroupClassificationsPanelProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName('');
    } catch (err: any) {
      setError(err?.message || 'Could not create classification.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card group-classifications-card">
      <h2>Classifications</h2>
      <p className="muted">
        Tags like Pitchers, JV, or Rehab — assign members to groups, then target workouts to a classification.
      </p>

      {classifications.length === 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          No classifications yet. Add one below.
        </p>
      )}

      {classifications.map((c) => {
        const count = countMembersInClassification(c.id, members, memberClassificationIds);
        return (
          <div key={c.id} className="classification-row">
            <div>
              <b>{c.name}</b>
              <span className="muted">
                {count} member{count === 1 ? '' : 's'}
              </span>
            </div>
            <button
              type="button"
              className="btn small red"
              onClick={() => {
                if (confirm(`Delete "${c.name}"? Members will be unlinked from this tag.`)) {
                  onDelete(c).catch((err: any) => alert(err?.message || 'Could not delete.'));
                }
              }}
            >
              Delete
            </button>
          </div>
        );
      })}

      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <label htmlFor="new-classification-name">Add classification</label>
        <div className="classification-add-row">
          <input
            id="new-classification-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pitchers"
            disabled={busy}
          />
          <button type="submit" className="btn secondary" disabled={busy}>
            Add
          </button>
        </div>
        {error && <p className="assign-error">{error}</p>}
      </form>
    </div>
  );
}
