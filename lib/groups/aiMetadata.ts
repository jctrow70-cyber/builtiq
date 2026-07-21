/** BIQ-0043-P8: Assignment / group AI metadata hooks (structure only — no AI UI). */

export type AssignmentCoachingMetadata = {
  intent?: string;
  progression_rules?: string[];
  readiness_modifiers?: Record<string, unknown>;
  target_rpe?: number;
  notes_for_coach?: string;
  generated_by?: 'manual' | 'ai' | 'template';
  version?: number;
};

export type GroupCoachingMetadata = {
  sport?: string;
  season_phase?: string;
  group_goals?: string[];
  compliance_target_pct?: number;
};

export function normalizeCoachingMetadata(raw: unknown): AssignmentCoachingMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: AssignmentCoachingMetadata = {};

  if (typeof input.intent === 'string' && input.intent.trim()) out.intent = input.intent.trim();
  if (Array.isArray(input.progression_rules)) {
    out.progression_rules = input.progression_rules
      .map((v) => String(v || '').trim())
      .filter(Boolean);
  }
  if (input.readiness_modifiers && typeof input.readiness_modifiers === 'object' && !Array.isArray(input.readiness_modifiers)) {
    out.readiness_modifiers = input.readiness_modifiers as Record<string, unknown>;
  }
  if (typeof input.target_rpe === 'number' && Number.isFinite(input.target_rpe)) out.target_rpe = input.target_rpe;
  if (typeof input.notes_for_coach === 'string' && input.notes_for_coach.trim()) {
    out.notes_for_coach = input.notes_for_coach.trim();
  }
  if (input.generated_by === 'manual' || input.generated_by === 'ai' || input.generated_by === 'template') {
    out.generated_by = input.generated_by;
  }
  if (typeof input.version === 'number' && Number.isFinite(input.version)) out.version = input.version;

  return out;
}

export function normalizeGroupCoachingMetadata(raw: unknown): GroupCoachingMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: GroupCoachingMetadata = {};

  if (typeof input.sport === 'string' && input.sport.trim()) out.sport = input.sport.trim();
  if (typeof input.season_phase === 'string' && input.season_phase.trim()) out.season_phase = input.season_phase.trim();
  if (Array.isArray(input.group_goals)) {
    out.group_goals = input.group_goals.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof input.compliance_target_pct === 'number' && Number.isFinite(input.compliance_target_pct)) {
    out.compliance_target_pct = input.compliance_target_pct;
  }

  return out;
}

export function coachingMetadataForRpc(raw?: AssignmentCoachingMetadata | null): Record<string, unknown> {
  return normalizeCoachingMetadata(raw || {});
}
