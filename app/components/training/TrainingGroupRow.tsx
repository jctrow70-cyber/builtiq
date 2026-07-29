'use client';

type GroupOption = { id: string; name: string };

type TrainingGroupRowProps = {
  groups: GroupOption[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
};

export default function TrainingGroupRow({
  groups,
  selectedGroupId,
  onSelectGroup,
}: TrainingGroupRowProps) {
  if (groups.length === 0) return null;

  const selected = groups.find((g) => g.id === selectedGroupId) || groups[0];
  if (!selected) return null;

  if (groups.length === 1) {
    return (
      <div className="training-group-row training-group-row--static">
        <span className="training-group-name">{selected.name}</span>
      </div>
    );
  }

  return (
    <label className="training-group-row training-group-row--select">
      <span className="training-group-name">{selected.name}</span>
      <span className="training-group-chevron" aria-hidden="true">›</span>
      <select
        className="training-group-select"
        value={selected.id}
        onChange={(e) => onSelectGroup(e.target.value)}
        aria-label="Switch group"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
