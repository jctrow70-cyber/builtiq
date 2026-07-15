/** BIQ-0027: Coach vs athlete permissions */

import type { TeamRole } from './types';

export function isCoachRole(role?: string | null): boolean {
  return role === 'owner' || role === 'editor';
}

export function isAthleteRole(role?: string | null): boolean {
  return role === 'member' || !role;
}

/** Coach management platform (Team Training coach view) */
export function canAccessCoachPlatform(teamRole?: string | null, inTeamMode = true): boolean {
  return inTeamMode && isCoachRole(teamRole);
}

/** Athlete can log own workouts; coach can co-log when viewing member */
export function canLogWorkout(opts: {
  sessionUserId: string;
  targetUserId: string;
  teamRole?: string | null;
  inTeamMode?: boolean;
}): boolean {
  if (opts.targetUserId === opts.sessionUserId) return true;
  return canAccessCoachPlatform(opts.teamRole, opts.inTeamMode ?? true);
}

/** Edit program templates — not when co-viewing another athlete */
export function canEditProgramTemplate(opts: {
  personalMode: boolean;
  teamRole?: string | null;
  viewingOtherMember: boolean;
}): boolean {
  if (opts.viewingOtherMember) return false;
  if (opts.personalMode) return true;
  return isCoachRole(opts.teamRole);
}
