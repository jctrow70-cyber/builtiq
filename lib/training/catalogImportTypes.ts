/** Shared types for catalog bulk import (app API + CLI scripts). */

export type ExternalExerciseRecord = {
  external_source: string;
  external_id: string;
  name: string;
  exercise_type?: string;
  primary_muscle?: string;
  secondary_muscles?: string[] | string;
  equipment?: string;
  movement_pattern?: string;
  instructions?: string;
  media_url?: string;
  thumbnail_url?: string;
  gif_url?: string;
  category?: string;
  training_goal?: string;
  progression_type?: string;
  coaching_metadata?: Record<string, unknown>;
};

export type MappedCatalogRow = {
  name: string;
  category: string;
  muscle_group: string;
  equipment: string;
  movement_pattern: string | null;
  exercise_type: string;
  instructions: string | null;
  media_url: string | null;
  image_url: string | null;
  gif_url: string | null;
  external_source: string;
  external_id: string;
  training_goal: string | null;
  progression_type: string | null;
  primary_muscle_percentage: number | null;
  secondary_muscle_percentage: number | null;
  muscle_targets: { muscle: string; percentage: number; role: 'primary' | 'secondary' }[] | null;
  coaching_metadata: Record<string, unknown>;
  is_system: true;
  user_id: null;
  is_archived: false;
};

export type GuidedImportStats = {
  totalFound: number;
  imported: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
};

export type ImportStats = GuidedImportStats & {
  skipReasons: Record<string, number>;
  duplicatesInFile: number;
};

export type ImportAction =
  | { kind: 'insert'; row: MappedCatalogRow }
  | { kind: 'update'; id: string; row: MappedCatalogRow }
  | { kind: 'skip'; reason: string; name: string; externalKey: string };
