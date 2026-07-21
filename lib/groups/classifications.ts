import type { GroupClassification } from './schema';

export function classificationSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'group-tag';
}

export function memberClassificationIds(
  memberId: string,
  links: Record<string, string[]>
): string[] {
  return links[memberId] || [];
}

export function classificationNamesForMember(
  memberId: string,
  classifications: GroupClassification[],
  links: Record<string, string[]>
): string[] {
  const ids = new Set(links[memberId] || []);
  return classifications.filter((c) => ids.has(c.id)).map((c) => c.name);
}

export function countMembersInClassification(
  classificationId: string,
  members: { id: string; is_active_participant?: boolean }[],
  links: Record<string, string[]>
): number {
  return members.filter(
    (m) =>
      m.is_active_participant !== false &&
      (links[m.id] || []).includes(classificationId)
  ).length;
}
