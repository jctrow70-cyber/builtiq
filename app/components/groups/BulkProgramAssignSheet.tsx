'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DateInput from '../DateInput';
import { assignGroupPrograms } from '../../../lib/groups/assignGroupTraining';
import type { WizardProgram } from '../../../lib/groups/assignmentWizard';
import {
  assignableBulkPrograms,
  buildBulkProgramReview,
  bulkAssignRpcPayload,
  bulkOperationKey,
  cappedMemberNames,
  groupBulkExclusions,
  nextBulkRequestKey,
  recordBulkAssignSuccess,
  type BulkProgramCandidate,
} from '../../../lib/groups/bulkProgramAssign';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';

const BULK_REMOVE_CAP = 12;

type BulkProgramAssignSheetProps = {
  teamId: string;
  programs: any[];
  frozenIds: string[];
  candidates: BulkProgramCandidate[];
  today: string;
  onClose: () => void;
  onTrainingChanged: () => void;
  onAssigned: () => void;
};

function asBulkProgram(program: any): WizardProgram | null {
  if (!program?.id) return null;
  return {
    id: program.id,
    name: program.name || 'Program',
    visibility: program.visibility,
    teamId: program.team_id || program.teamId || null,
    status: program.status,
    workouts: [],
  };
}

function failureCopy(message: string): string {
  if (/nothing was assigned|nothing was changed|nothing was saved/i.test(message)) return message;
  return `${message} Nothing was changed.`;
}

export default function BulkProgramAssignSheet({
  teamId,
  programs,
  frozenIds,
  candidates,
  today,
  onClose,
  onTrainingChanged,
  onAssigned,
}: BulkProgramAssignSheetProps) {
  const [programId, setProgramId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [request, setRequest] = useState<{ operationKey: string; requestKey: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ message: string; alreadySaved: boolean } | null>(null);
  const [resultOperationKey, setResultOperationKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorOperationKey, setErrorOperationKey] = useState<string | null>(null);
  const [removeQuery, setRemoveQuery] = useState('');
  const [removeLimit, setRemoveLimit] = useState(8);
  const pendingRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function requestClose() {
    if (pendingRef.current) return;
    onClose();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pendingRef.current) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choices = useMemo(() => {
    const mapped = programs.map(asBulkProgram).filter((program): program is WizardProgram => !!program);
    return assignableBulkPrograms(mapped, teamId);
  }, [programs, teamId]);
  const selectedProgram = choices.find((program) => program.id === programId) || null;
  const review = useMemo(
    () =>
      buildBulkProgramReview({
        frozenIds,
        candidates,
        removedIds,
        targetProgramId: selectedProgram?.id || '',
        targetProgramName: selectedProgram?.name || '',
        effectiveDate,
        today,
        teamId,
      }),
    [frozenIds, candidates, removedIds, selectedProgram, effectiveDate, today, teamId]
  );
  const operationKey = bulkOperationKey({
    teamId,
    memberUserIds: review.confirmedIds,
    programId: selectedProgram?.id || '',
    effectiveDate,
  });
  const visibleResult = result && resultOperationKey === operationKey ? result : null;
  const visibleError = error && errorOperationKey === operationKey ? error : null;
  const confirmationStale = !!resultOperationKey && resultOperationKey !== operationKey;
  const exclusionGroups = groupBulkExclusions(review.excluded);
  const removed = useMemo(() => {
    const dropped = new Set(removedIds);
    const eligible = new Set(
      buildBulkProgramReview({
        frozenIds,
        candidates,
        targetProgramId: selectedProgram?.id || '',
        targetProgramName: selectedProgram?.name || '',
        effectiveDate,
        today,
        teamId,
      }).confirmed.map((member) => member.userId)
    );
    return candidates.filter((candidate) => dropped.has(candidate.userId) && eligible.has(candidate.userId));
  }, [removedIds, frozenIds, candidates, selectedProgram, effectiveDate, today, teamId]);
  const needle = removeQuery.trim().toLowerCase();
  const removable = review.confirmed.filter((member) => !needle || member.name.toLowerCase().includes(needle));
  const shownRemovable = removable.slice(0, removeLimit);

  function removeMember(userId: string) {
    setRemovedIds((current) => (current.includes(userId) ? current : [...current, userId]));
    setRemoveLimit(8);
  }

  function restoreMember(userId: string) {
    setRemovedIds((current) => current.filter((id) => id !== userId));
  }

  async function submit() {
    if (pendingRef.current || !review.canSubmit || !selectedProgram) return;
    const next = nextBulkRequestKey({
      operationKey,
      previous: request,
      mint: () => crypto.randomUUID(),
    });
    setRequest(next);
    const prior = acknowledged[next.requestKey];
    if (next.reused && prior != null) {
      const outcome = recordBulkAssignSuccess({
        requestKey: next.requestKey,
        memberCount: prior,
        acknowledged,
      });
      setResult(outcome);
      setResultOperationKey(operationKey);
      setError(null);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const payload = bulkAssignRpcPayload({
      teamId,
      memberUserIds: review.confirmedIds,
      programId: selectedProgram.id,
      startsOn: effectiveDate,
      requestKey: next.requestKey,
    });
    const { error: assignError, memberCount } = await assignGroupPrograms(supabase, payload);
    pendingRef.current = false;
    if (!alive.current) {
      if (!assignError) {
        onTrainingChanged();
        onAssigned();
      }
      return;
    }
    setPending(false);
    if (assignError) {
      setError(failureCopy(assignError));
      setErrorOperationKey(operationKey);
      setResult(null);
      setResultOperationKey(null);
      return;
    }
    const outcome = recordBulkAssignSuccess({
      requestKey: next.requestKey,
      memberCount,
      acknowledged,
    });
    setAcknowledged(outcome.acknowledged);
    setResult(outcome);
    setResultOperationKey(operationKey);
    if (!outcome.alreadySaved) {
      onTrainingChanged();
      onAssigned();
    }
  }

  return (
    <div className="member-profile-backdrop" onClick={requestClose}>
      <div
        className="member-profile-sheet card"
        data-testid="bulk-program-review"
        role="dialog"
        aria-modal="true"
        aria-label="Assign or change program"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Assign or change program</h2>
          <button type="button" className="btn small secondary" onClick={requestClose}>
            Close
          </button>
        </div>
        <p className="muted">
          This assigns the selected program or changes the current one. Training days, pause, and resume stay on each member.
        </p>
        <p data-testid="bulk-program-counts">
          Selected {review.originalSelectedCount}. Confirmed {review.confirmedCount}.
        </p>
        <p>
          {review.distinctCurrentProgramCount === 0
            ? 'No current program in this list.'
            : review.distinctCurrentProgramCount === 1
              ? '1 current program in this list.'
              : `${review.distinctCurrentProgramCount} different current programs in this list.`}
        </p>
        <label>
          Program
          <select aria-label="Target program" value={selectedProgram?.id || ''} onChange={(event) => setProgramId(event.target.value)}>
            <option value="">Choose a program</option>
            {choices.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </label>
        {!choices.length && <p className="muted">No published group programs are available.</p>}
        <label>
          Effective date
          <DateInput value={effectiveDate} onChange={setEffectiveDate} aria-label="Effective date" />
        </label>
        <p>
          Target program: {selectedProgram?.name || 'Choose a program'}. Effective date: {formatDisplayDate(effectiveDate)}.
        </p>
        {exclusionGroups.map((group) => {
          const names = cappedMemberNames(group.names);
          return (
            <div key={group.code}>
              <p>
                <b>Excluded · {group.names.length}</b>
              </p>
              <p>{group.reason}</p>
              {names.names.length > 0 && (
                <p className="muted">
                  {names.names.join(', ')}
                  {names.hiddenCount > 0 ? ` and ${names.hiddenCount} more` : ''}
                </p>
              )}
            </div>
          );
        })}
        {review.warnings.map((warning) => {
          const names = cappedMemberNames(warning.names);
          return (
            <div key={warning.code}>
              <p>{warning.message}</p>
              {names.names.length > 0 && (
                <p className="muted">
                  {names.names.join(', ')}
                  {names.hiddenCount > 0 ? ` and ${names.hiddenCount} more` : ''}
                </p>
              )}
            </div>
          );
        })}
        <p>{review.historyMessage}</p>
        <p>{review.expectationMessage}</p>
        <label>
          Find a member to remove
          <input
            value={removeQuery}
            aria-label="Find a confirmed member"
            placeholder="Name"
            onChange={(event) => {
              setRemoveQuery(event.target.value);
              setRemoveLimit(8);
            }}
          />
        </label>
        <p className="muted">{review.confirmedCount} confirmed members will receive this program.</p>
        {shownRemovable.map((member) => (
          <div key={member.userId} className="bulk-program-remove">
            <span>{member.name}</span>
            <button type="button" className="btn small secondary" onClick={() => removeMember(member.userId)}>
              Remove
            </button>
          </div>
        ))}
        {removable.length > shownRemovable.length && (
          <button type="button" className="btn small secondary" onClick={() => setRemoveLimit((count) => count + 20)}>
            Show more confirmed members
          </button>
        )}
        {removed.length > 0 && (
          <div>
            <p>
              <b>Removed from this assignment</b>
            </p>
            {removed.slice(0, BULK_REMOVE_CAP).map((member) => (
              <div key={member.userId} className="bulk-program-remove">
                <span>{member.name}</span>
                <button type="button" className="btn small secondary" onClick={() => restoreMember(member.userId)}>
                  Add back
                </button>
              </div>
            ))}
          </div>
        )}
        {confirmationStale && (
          <p>The recipients, program, or date changed. Review this assignment again before assigning.</p>
        )}
        {visibleResult && (
          <p role="status" data-testid="bulk-program-result">
            {visibleResult.message}
          </p>
        )}
        {visibleError && <p role="alert">{visibleError}</p>}
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn green" disabled={pending || !review.canSubmit} onClick={() => void submit()}>
            {pending ? 'Assigning…' : 'Assign program'}
          </button>
        </div>
      </div>
    </div>
  );
}
