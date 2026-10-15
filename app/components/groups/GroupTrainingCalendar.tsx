'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GroupClassification } from '../../../lib/groups/schema';
import {
  adjacentCalendarWeek,
  buildGroupCalendar,
  calendarMemberIds,
  CALENDAR_DEPENDENCY_NOTICE,
  visibleCalendarCards,
  type GroupCalendarCard,
} from '../../../lib/groups/groupCalendar';
import { loadGroupCalendarWeek, type GroupCalendarWeekFacts } from '../../../lib/groups/loadGroupTrainingFacts';
import { addDaysYmd, formatDisplayDate, mondayOfWeek, todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import WorkoutScheduleActions from './WorkoutScheduleActions';

type GroupTrainingCalendarProps = {
  teamId: string;
  teamName?: string | null;
  canSeeAll: boolean;
  canEdit: boolean;
  viewerUserId: string;
  reloadKey: number;
  members: Array<{ id?: string; userId: string; name: string }>;
  classifications?: GroupClassification[];
  memberClassificationIds?: Record<string, string[]>;
  onOpenMember: (userId: string) => void;
  onMoveWorkout?: (input: { memberUserId: string; workoutId: string; originalDate: string; newDate: string }) => Promise<void>;
  onExcuseWorkout?: (input: { memberUserId: string; workoutId: string; originalDate: string }) => Promise<void>;
  onRestoreWorkout?: (input: { memberUserId: string; workoutId: string; originalDate: string }) => Promise<void>;
};

export default function GroupTrainingCalendar({
  teamId,
  canSeeAll,
  canEdit,
  viewerUserId,
  reloadKey,
  members,
  classifications = [],
  memberClassificationIds = {},
  onOpenMember,
  onMoveWorkout,
  onExcuseWorkout,
  onRestoreWorkout,
}: GroupTrainingCalendarProps) {
  const today = todayYmd();
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(() => today);
  const [memberUserId, setMemberUserId] = useState('');
  const [classificationId, setClassificationId] = useState('');
  const [facts, setFacts] = useState<GroupCalendarWeekFacts | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<GroupCalendarCard | null>(null);

  const memberIds = useMemo(() => members.map((member) => member.userId).join(','), [members]);

  useEffect(() => {
    let cancelled = false;
    setFacts(null);
    void loadGroupCalendarWeek(supabase, {
      teamId,
      weekStart,
      today,
      viewerUserId,
      memberUserIds: memberIds ? memberIds.split(',') : [],
    }).then((next) => {
      if (!cancelled) setFacts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, weekStart, today, viewerUserId, reloadKey, memberIds]);

  useEffect(() => {
    const end = facts?.to;
    if (!end) return;
    if (selectedDay < weekStart || selectedDay > end) {
      setSelectedDay(today >= weekStart && today <= end ? today : weekStart);
    }
  }, [weekStart, facts?.to, selectedDay, today]);

  const visibleUserIds = useMemo(
    () =>
      calendarMemberIds({
        members: members.map((member) => ({ userId: member.userId, memberId: member.id })),
        links: memberClassificationIds,
        classificationId: classificationId || null,
        memberUserId: memberUserId || null,
        canSeeAll,
        viewerUserId,
      }),
    [members, memberClassificationIds, classificationId, memberUserId, canSeeAll, viewerUserId]
  );

  const week = useMemo(() => {
    if (!facts?.expectationsAvailable) return null;
    return buildGroupCalendar({
      weekStart,
      today,
      teamId,
      expectations: facts.expectations,
      members,
      visibleUserIds,
      completionKnown: facts.completionKnown,
    });
  }, [facts, weekStart, today, teamId, members, visibleUserIds]);

  function showWeek(next: string) {
    setWeekStart(next);
    setSelected(null);
    setExpanded({});
    setSelectedDay(today >= next && today <= addDaysYmd(next, 6) ? today : next);
  }

  const dayCards = (date: string) => week?.days.find((day) => day.date === date)?.workouts || [];

  function renderCard(card: GroupCalendarCard) {
    return (
      <div key={card.key} className="group-calendar-card">
        <button type="button" className="group-calendar-card-open" onClick={() => setSelected(card)}>
          <b>{card.memberName}</b>
          <span>{card.title}</span>
          <span className="muted">{card.sourceLabel}</span>
        </button>
        <span className={`group-training-status group-training-week-${card.state.replace(/\s+/g, '-').toLowerCase()}`}>{card.state}</span>
        <button type="button" className="group-calendar-name" onClick={() => onOpenMember(card.userId)}>
          Open {card.memberName}
        </button>
      </div>
    );
  }

  function renderDay(date: string, weekday: string) {
    const cards = dayCards(date);
    const shown = visibleCalendarCards(cards, !!expanded[date]);
    return (
      <div key={date} className="group-calendar-day">
        <div className="group-calendar-day-head">
          <b>{weekday}</b>
          <span className="muted">{formatDisplayDate(date)}</span>
        </div>
        {cards.length === 0 ? <p className="muted">No workouts</p> : shown.visible.map(renderCard)}
        {shown.hidden > 0 && (
          <button type="button" className="group-calendar-more" onClick={() => setExpanded((current) => ({ ...current, [date]: true }))}>
            +{shown.hidden} more
          </button>
        )}
        {expanded[date] && cards.length > 3 && (
          <button type="button" className="group-calendar-more" onClick={() => setExpanded((current) => ({ ...current, [date]: false }))}>
            Show less
          </button>
        )}
      </div>
    );
  }

  const mobileDay = week?.days.find((day) => day.date === selectedDay) || week?.days[0];

  return (
    <div className="group-calendar">
      <div className="group-calendar-nav">
        <button type="button" className="member-icon-btn" aria-label="Previous week" onClick={() => showWeek(adjacentCalendarWeek(weekStart, -1))}>
          ‹
        </button>
        <div className="member-week-heading">
          <b>
            {formatDisplayDate(weekStart)} – {formatDisplayDate(week?.weekEnd || weekStart)}
          </b>
          {weekStart !== mondayOfWeek(today) && (
            <button type="button" className="member-text-btn" onClick={() => showWeek(mondayOfWeek(today))}>
              Today
            </button>
          )}
          {week ? <span className="muted">{week.workoutCount} workouts · {week.memberCount} members</span> : null}
        </div>
        <button type="button" className="member-icon-btn" aria-label="Next week" onClick={() => showWeek(adjacentCalendarWeek(weekStart, 1))}>
          ›
        </button>
      </div>
      <div className="group-calendar-filters">
        <label>
          Member
          <select value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>
            <option value="">All members</option>
            {members
              .filter((member) => canSeeAll || member.userId === viewerUserId)
              .map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Classification
          <select value={classificationId} onChange={(event) => setClassificationId(event.target.value)}>
            <option value="">All classifications</option>
            {classifications.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!facts ? <p className="muted">Loading the week…</p> : null}
      {facts && !facts.expectationsAvailable ? <p className="team-sheet-error">{facts.notice || CALENDAR_DEPENDENCY_NOTICE}</p> : null}
      {week && (
        <>
          <div className="group-calendar-board">
            {week.days.map((day) => renderDay(day.date, day.weekday))}
          </div>
          <div className="group-calendar-mobile">
            <div className="group-calendar-day-strip">
              {week.days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  className={day.date === mobileDay?.date ? 'is-current' : ''}
                  onClick={() => setSelectedDay(day.date)}
                >
                  <span>{day.weekday}</span>
                  <b>{Number(day.date.slice(8, 10))}</b>
                </button>
              ))}
            </div>
            {mobileDay ? renderDay(mobileDay.date, mobileDay.weekday) : null}
          </div>
        </>
      )}
      {selected && (
        <WorkoutScheduleActions
          memberName={selected.memberName}
          workout={selected}
          canEdit={canEdit && (canSeeAll || selected.userId === viewerUserId)}
          sameSchedule={dayCards(selected.date)}
          onClose={() => setSelected(null)}
          onMoveWorkout={
            onMoveWorkout
              ? (input) => onMoveWorkout({ ...input, memberUserId: selected.userId })
              : undefined
          }
          onExcuseWorkout={
            onExcuseWorkout
              ? (input) => onExcuseWorkout({ ...input, memberUserId: selected.userId })
              : undefined
          }
          onRestoreWorkout={
            onRestoreWorkout
              ? (input) => onRestoreWorkout({ ...input, memberUserId: selected.userId })
              : undefined
          }
        />
      )}
    </div>
  );
}
