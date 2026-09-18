/** CSV export of the exercise catalog for review / overhaul. */

export const CATALOG_EXPORT_COLUMNS = [
  'id',
  'name',
  'external_source',
  'external_id',
  'exercise_type',
  'category',
  'muscle_group',
  'equipment',
  'movement_pattern',
  'instructions',
  'thumbnail_url',
  'gif_url',
  'media_url',
  'is_system',
  'is_archived',
] as const;

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function catalogRowToExportRecord(row: any): Record<(typeof CATALOG_EXPORT_COLUMNS)[number], string> {
  return {
    id: String(row?.id || ''),
    name: String(row?.name || ''),
    external_source: String(row?.external_source || ''),
    external_id: String(row?.external_id || ''),
    exercise_type: String(row?.exercise_type || ''),
    category: String(row?.category || ''),
    muscle_group: String(row?.muscle_group || ''),
    equipment: String(row?.equipment || ''),
    movement_pattern: String(row?.movement_pattern || ''),
    instructions: String(row?.instructions || ''),
    thumbnail_url: String(row?.image_url || row?.thumbnail_url || ''),
    gif_url: String(row?.gif_url || ''),
    media_url: String(row?.media_url || ''),
    is_system: row?.is_system === false ? 'false' : 'true',
    is_archived: row?.is_archived ? 'true' : 'false',
  };
}

export function catalogRowsToCsv(rows: any[]): string {
  const header = CATALOG_EXPORT_COLUMNS.join(',');
  const body = (rows || []).map((row) => {
    const rec = catalogRowToExportRecord(row);
    return CATALOG_EXPORT_COLUMNS.map((col) => csvCell(rec[col])).join(',');
  });
  return [header, ...body].join('\n');
}
