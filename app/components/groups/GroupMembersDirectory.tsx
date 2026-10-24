'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { classificationNamesForMember, roleForUi, type GroupClassification, type MemberRosterMeta } from '../../../lib/groups';
import {
  canShowBulkProgramToolbar,
  filteredSelectionState,
  freezeRecipientIds,
  hiddenSelectedCount,
  joinBulkProgramCandidate,
  selectionAfterGroupChange,
  toggleFilteredSelection,
  toggleMemberSelection,
  type BulkProgramCandidate,
} from '../../../lib/groups/bulkProgramAssign';
import {
  buildMemberDirectory,
  DIRECTORY_STATUS_OPTIONS,
  filterMemberDirectory,
  MEMBER_DIRECTORY_PAGE_SIZE,
  visibleDirectoryRows,
  type DirectorySort,
  type DirectoryTrainingSnapshot,
} from '../../../lib/groups/memberDirectory';
import BulkProgramAssignSheet from './BulkProgramAssignSheet';
import type { GroupTrainingBoard } from '../../../lib/groups/trainingWorkspace';
import { mondayOfWeek, sundayOfWeek, todayYmd } from '../../../lib/training/programCalendar';

type GroupMembersDirectoryProps = {
  teamId: string;
  sessionUserId: string;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
  memberRosterMeta: Record<string, MemberRosterMeta>;
  classifications: GroupClassification[];
  memberClassificationIds: Record<string, string[]>;
  canManage: boolean;
  canAssign: boolean;
  canViewActivity: boolean;
  isOwner?: boolean;
  board: GroupTrainingBoard | null;
  trainingReady: boolean;
  onRefresh: () => void;
  onOpenMember: (userId: string) => void;
  onSetMemberRole?: (member: any, role: string) => void;
  onSetParticipation?: (member: any, active: boolean) => void;
  onRemoveMember?: (member: any) => void;
  onToggleMemberClassification?: (member: any, classificationId: string, active: boolean) => void;
  programs?: any[];
  onTrainingChanged: () => void;
};

export default function GroupMembersDirectory({
  teamId,
  sessionUserId,
  members,
  memberStats,
  memberRosterMeta,
  classifications,
  memberClassificationIds,
  canManage,
  canAssign,
  canViewActivity,
  isOwner = false,
  board,
  trainingReady,
  onRefresh,
  onOpenMember,
  onSetMemberRole,
  onSetParticipation,
  onRemoveMember,
  onToggleMemberClassification,
  programs = [],
  onTrainingChanged,
}: GroupMembersDirectoryProps) {
  const [nameQuery, setNameQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState<DirectorySort>('name');
  const [visibleCount, setVisibleCount] = useState(MEMBER_DIRECTORY_PAGE_SIZE);
  const [membershipUserId, setMembershipUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameQuery('');
    setRoleFilter('all');
    setProgramFilter('all');
    setStatusFilter('all');
    setSort('name');
    setVisibleCount(MEMBER_DIRECTORY_PAGE_SIZE);
    setMembershipUserId(null);
    setSelectedIds(selectionAfterGroupChange());
    setReviewIds(null);
  }, [teamId]);

  useEffect(() => {
    setVisibleCount(MEMBER_DIRECTORY_PAGE_SIZE);
  }, [nameQuery, roleFilter, programFilter, statusFilter, sort]);

  const today = todayYmd();
  const rows = useMemo(() => {
    const training: DirectoryTrainingSnapshot[] = (board?.members || []).map((member) => ({
      userId: member.userId,
      planName: member.planName,
      status: member.status,
      statusLabel: member.statusLabel,
      nextDate: member.nextWorkout?.date || null,
      nextLabel: member.nextWorkout?.label || null,
    }));
    return buildMemberDirectory({
      roster: members
        .filter((member) => member.user_id)
        .map((member) => ({
          id: member.id || member.user_id,
          userId: member.user_id,
          name: member.display_name || 'Member',
          role: member.role || 'member',
        })),
      training,
      viewerUserId: sessionUserId,
      canManage,
      canAssign,
      today,
      weekStart: mondayOfWeek(today),
      weekEnd: sundayOfWeek(today),
      trainingReady,
    });
  }, [members, board, sessionUserId, canManage, canAssign, today, trainingReady]);

  const filtered = useMemo(
    () =>
      filterMemberDirectory(rows, {
        name: nameQuery,
        role: roleFilter,
        program: programFilter,
        status: statusFilter,
        sort,
      }),
    [rows, nameQuery, roleFilter, programFilter, statusFilter, sort]
  );
  const shown = visibleDirectoryRows(filtered, visibleCount);
  const programOptions = Array.from(new Set(rows.map((row) => row.programLabel).filter((label): label is string => !!label))).sort((left, right) =>
    left.localeCompare(right)
  );
  const memberByUser = useMemo(
    () => new Map(members.filter((member) => member.user_id).map((member) => [member.user_id, member])),
    [members]
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredIds = useMemo(() => filtered.map((row) => row.userId), [filtered]);
  const selectionState = filteredSelectionState(selected, filteredIds);
  const hiddenSelected = hiddenSelectedCount(selected, filteredIds);
  const showBulk = canShowBulkProgramToolbar(canAssign);
  const candidates = useMemo(() => {
    if (!showBulk) return [] as BulkProgramCandidate[];
    const boardByUser = new Map((board?.members || []).map((member) => [member.userId, member]));
    return rows.map((row) => {
      const source = memberByUser.get(row.userId);
      const trained = boardByUser.get(row.userId);
      return joinBulkProgramCandidate({
        userId: row.userId,
        name: row.name,
        membershipStatus: source?.status || 'active',
        isActiveParticipant: source ? source.is_active_participant !== false : true,
        programId: trained?.programId || null,
        programLabel: trained?.planName || null,
        enrollmentStatus: trained?.enrollmentStatus ?? null,
        expectationEnabled: trained ? trained.expectationsEnabled : null,
        planKind: trained?.planKind || null,
      });
    });
  }, [showBulk, rows, board, memberByUser]);

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = selectionState === 'some';
  }, [selectionState]);

  function commitSelection(next: Set<string>) {
    setSelectedIds(Array.from(next));
  }

  return (
    <div className="card team-roster-card" data-testid="member-directory">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Members</h2>
        <button type="button" className="btn small secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="muted">
        {canManage
          ? 'Search the roster. Training details follow the same permissions as the calendar.'
          : 'Your training is listed here. Other members’ programs stay private.'}
      </p>
      <div className="member-directory-controls">
        <label className="member-directory-search">
          Search members
          <input
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="Name"
            aria-label="Search members"
          />
        </label>
        <label>
          Role
          <select value={roleFilter} aria-label="Role" onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">All roles</option>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
          </select>
        </label>
        <label>
          Program
          <select value={programFilter} aria-label="Program" onChange={(event) => setProgramFilter(event.target.value)}>
            <option value="all">All programs</option>
            {programOptions.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} aria-label="Training status" onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {DIRECTORY_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select value={sort} aria-label="Sort members" onChange={(event) => setSort(event.target.value as DirectorySort)}>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="next">Next this week</option>
          </select>
        </label>
      </div>
      {showBulk && (
        <div className="bulk-program-toolbar" data-testid="bulk-program-toolbar">
          <label className="remember-row">
            <input
              ref={headerRef}
              type="checkbox"
              aria-label="Select all filtered members"
              checked={selectionState === 'all'}
              disabled={filteredIds.length === 0}
              onChange={() => commitSelection(toggleFilteredSelection(selected, filteredIds))}
            />
            All filtered
          </label>
          <button type="button" className="btn small secondary" disabled={selectedIds.length === 0} onClick={() => setSelectedIds(selectionAfterGroupChange())}>
            Clear selection
          </button>
          <button
            type="button"
            className="btn small green"
            disabled={selectedIds.length === 0 || !trainingReady}
            onClick={() => setReviewIds(freezeRecipientIds(selectedIds))}
          >
            Assign or change program
          </button>
          <p className="bulk-program-summary" data-testid="bulk-program-summary" aria-live="polite">
            {selectedIds.length} selected · {hiddenSelected} hidden by the current filter
          </p>
        </div>
      )}
      {members.length === 0 && <p className="muted">No members yet. Invite people below or share your group invite code.</p>}
      {members.length > 0 && filtered.length === 0 && <p className="muted">No members match that search.</p>}
      <div className="member-directory-list" data-testid="member-directory-list">
        {shown.map((row) => {
          const source = memberByUser.get(row.userId);
          const stats = memberStats[row.userId] || { sets: 0, days: 0 };
          const showActivity = canViewActivity || row.isSelf;
          const rosterMeta = memberRosterMeta[row.userId];
          const memberTags = source ? classificationNamesForMember(source.id, classifications, memberClassificationIds) : [];
          const membershipOpen = membershipUserId === row.userId;
          return (
            <div key={row.userId} className="member-directory-row" data-testid="member-directory-row">
              <div className="member-directory-select">
              {showBulk && (
                <label className="member-directory-check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.name}`}
                    checked={selected.has(row.userId)}
                    onChange={() => commitSelection(toggleMemberSelection(selected, row.userId))}
                  />
                </label>
              )}
              <button
                type="button"
                className="member-directory-main"
                aria-label={`${row.name}${row.isSelf ? ' (you)' : ''}`}
                disabled={!row.canOpen}
                onClick={() => row.canOpen && onOpenMember(row.userId)}
              >
                <b>
                  {row.name}
                  {row.isSelf ? ' (you)' : ''}
                </b>
                <span className="member-directory-facts muted">
                  <span>{row.roleLabel}</span>
                  {memberTags.length > 0 && <span>{memberTags.join(', ')}</span>}
                  {row.trainingPending && <span>Loading training…</span>}
                  {row.trainingVisible && !row.trainingPending && (
                    <>
                      <span>{row.programLabel || 'No program assigned'}</span>
                      <span>{row.nextText}</span>
                      {row.statusLabel && <span>{row.statusLabel}</span>}
                    </>
                  )}
                  {showActivity && stats.days > 0 && (
                    <span>
                      {stats.days} day{stats.days === 1 ? '' : 's'} with group-attributed sets
                    </span>
                  )}
                  {showActivity && stats.sets > 0 && <span>{stats.sets} group-attributed sets</span>}
                </span>
              </button>
              </div>
              {showActivity && rosterMeta && (rosterMeta.recentPr || rosterMeta.assignmentOverdue > 0 || rosterMeta.assignmentPending > 0) && (
                <div className="member-roster-badges">
                  {rosterMeta.recentPr && <span className="badge progress-pr-badge">PR</span>}
                  {rosterMeta.assignmentOverdue > 0 && <span className="badge member-overdue-badge">{rosterMeta.assignmentOverdue} overdue</span>}
                  {rosterMeta.assignmentPending > 0 && <span className="badge">{rosterMeta.assignmentPending} pending</span>}
                </div>
              )}
              {canManage && source && (
                <button
                  type="button"
                  className="member-text-btn"
                  aria-expanded={membershipOpen}
                  onClick={() => setMembershipUserId(membershipOpen ? null : row.userId)}
                >
                  Membership
                </button>
              )}
              {canManage && source && membershipOpen && (
                <div className="team-member-admin member-schedule-editor">
                  {isOwner && onSetMemberRole && source.role !== 'owner' && (
                    <label>
                      Role
                      <select
                        value={roleForUi(source.role)}
                        onChange={(event) => onSetMemberRole(source, event.target.value)}
                        aria-label={`Role for ${row.name}`}
                      >
                        <option value="manager">Manager</option>
                        <option value="member">Member</option>
                      </select>
                    </label>
                  )}
                  {onSetParticipation && (
                    <label className="remember-row">
                      <input
                        type="checkbox"
                        checked={source.is_active_participant !== false}
                        onChange={(event) => onSetParticipation(source, event.target.checked)}
                      />{' '}
                      Active participant
                    </label>
                  )}
                  {classifications.length > 0 && onToggleMemberClassification && (
                    <div className="member-classification-picks">
                      {classifications.map((classification) => (
                        <label key={classification.id} className="classification-chip-toggle remember-row">
                          <input
                            type="checkbox"
                            checked={(memberClassificationIds[source.id] || []).includes(classification.id)}
                            onChange={(event) => onToggleMemberClassification(source, classification.id, event.target.checked)}
                          />
                          {classification.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {onRemoveMember && !row.isSelf && (
                    <button type="button" className="btn small red" onClick={() => onRemoveMember(source)}>
                      Remove from group
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length > shown.length && (
        <button
          type="button"
          className="btn secondary"
          data-testid="member-directory-more"
          onClick={() => setVisibleCount((count) => count + MEMBER_DIRECTORY_PAGE_SIZE)}
        >
          Show more members
        </button>
      )}
      {filtered.length > 0 && (
        <p className="muted member-directory-count">
          Showing {shown.length} of {filtered.length}
        </p>
      )}
      {showBulk && reviewIds && (
        <BulkProgramAssignSheet
          teamId={teamId}
          programs={programs}
          frozenIds={reviewIds}
          candidates={candidates}
          today={today}
          onClose={() => setReviewIds(null)}
          onTrainingChanged={onTrainingChanged}
          onAssigned={() => setSelectedIds(selectionAfterGroupChange())}
        />
      )}
    </div>
  );
}
