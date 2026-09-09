'use client';

import {
  addPanelSectionLabel,
  emptyAddPanelFilters,
  sectionDefaultSets,
  type AddPanelState,
} from '../../../lib/training/workoutTemplate';
import {
  buildCatalogFilterOptions,
  catalogResultMeta,
  countCatalogMatches,
  hasCatalogSearchInput,
  searchCatalog,
} from '../../../lib/training/catalogSearch';
import { equipmentFilterLabel, hasEquipmentFilter } from '../../../lib/training/equipmentFilter';
import { getExerciseGuidePayload, getExerciseThumb, hasExerciseGuide } from '../../../lib/training/exerciseMedia';

type AddExercisePanelProps = {
  panel: AddPanelState;
  catalog: any[];
  equipment?: string[];
  supersetGroups: { id: string; label: string; count: number }[];
  pendingGroupCount?: number;
  onChange: (next: AddPanelState) => void;
  onPick: (item: any) => void;
  onCreateCustom: () => void;
  onConfirm: () => void;
  onOpenGuide?: (payload: ReturnType<typeof getExerciseGuidePayload>) => void;
  onClose: () => void;
};

export default function AddExercisePanel({
  panel,
  catalog,
  equipment = [],
  supersetGroups,
  pendingGroupCount,
  onChange,
  onPick,
  onCreateCustom,
  onConfirm,
  onOpenGuide,
  onClose,
}: AddExercisePanelProps) {
  const filters = panel.filters || emptyAddPanelFilters();
  const searchOpts = {
    query: panel.query || '',
    filters: { ...filters, availableEquipment: hasEquipmentFilter(equipment) ? equipment : undefined },
    limit: 60,
  };
  const filterOptions = buildCatalogFilterOptions(catalog);
  const matchCount = countCatalogMatches(catalog, searchOpts);
  const results = searchCatalog(catalog, searchOpts);
  const hasSearch = hasCatalogSearchInput(searchOpts.query, searchOpts.filters);
  const guide = panel.picked ? getExerciseGuidePayload(panel.picked, panel.picked.name) : null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="add-exercise-panel card" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>
            {panel.replaceTarget ? 'Replace exercise' : 'Add Exercise'} · {addPanelSectionLabel(panel.section)}
          </h2>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Cancel
          </button>
        </div>

        {panel.step === 'search' && (
          <>
            {panel.replaceTarget && (
              <p className="muted" style={{ marginBottom: 8 }}>
                Replacing <b>{panel.replaceTarget.name}</b> — pick a catalog exercise. Sets and logs are kept.
              </p>
            )}
            {pendingGroupCount != null && pendingGroupCount > 0 && !panel.replaceTarget && (
              <p className="muted" style={{ marginBottom: 8 }}>
                Building superset ({pendingGroupCount}/3) — pick the next exercise
              </p>
            )}
            <p className="muted catalog-search-meta">Search the full BuildIQ Health exercise library — GIF guides appear when available.</p>
            <input
              className="typeahead-input catalog-search-input"
              placeholder={`Search exercises (${catalog.length} available)…`}
              value={panel.query || ''}
              onChange={(e) => onChange({ ...panel, query: e.target.value })}
              autoFocus
            />
            <div className="catalog-search-filters">
              <select
                value={filters.muscle || ''}
                onChange={(e) => onChange({ ...panel, filters: { ...filters, muscle: e.target.value } })}
                aria-label="Filter by muscle"
              >
                <option value="">All muscles</option>
                {(filterOptions?.muscles || []).map((m: string) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={filters.equipment || ''}
                onChange={(e) => onChange({ ...panel, filters: { ...filters, equipment: e.target.value } })}
                aria-label="Filter by equipment"
              >
                <option value="">All equipment</option>
                {(filterOptions?.equipment || []).map((eq: string) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </select>
              <select
                value={filters.exerciseType || ''}
                onChange={(e) => onChange({ ...panel, filters: { ...filters, exerciseType: e.target.value } })}
                aria-label="Filter by type"
              >
                <option value="">All types</option>
                {(filterOptions?.exerciseTypes || []).map((t: string) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="remember-row catalog-guides-filter">
                <input
                  type="checkbox"
                  checked={!!filters.guidesOnly}
                  onChange={(e) => onChange({ ...panel, filters: { ...filters, guidesOnly: e.target.checked } })}
                />{' '}
                With form guide (GIF / photo / instructions)
              </label>
            </div>
            {hasEquipmentFilter(equipment) && (
              <p className="muted catalog-search-meta">Your equipment filter is active: {equipmentFilterLabel(equipment)}</p>
            )}
            {hasSearch && (
              <p className="muted catalog-search-meta">
                Showing {results.length}
                {matchCount > results.length ? ` of ${matchCount}` : ''} match{matchCount === 1 ? '' : 'es'}
              </p>
            )}
            <div className="typeahead-menu panel-results catalog-search-results">
              {results.length ? (
                results.map((item: any) => (
                  <button type="button" key={item.id} className="typeahead-item catalog-search-item" onClick={() => onPick(item)}>
                    {getExerciseThumb(item) && (
                      <img className="catalog-search-thumb" src={getExerciseThumb(item) || ''} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    )}
                    <div className="catalog-search-body">
                      <b>{item.name}</b>
                      <span className="muted">{catalogResultMeta(item)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="typeahead-empty muted">
                  {hasSearch ? 'No matches — try a different search or filter' : 'Type or filter to search the catalog'}
                </div>
              )}
            </div>
            {hasSearch && (
              <button
                type="button"
                className="btn small secondary"
                style={{ marginTop: 8 }}
                onClick={() => onChange({ ...panel, query: '', filters: emptyAddPanelFilters() })}
              >
                Clear search
              </button>
            )}
            {!panel.replaceTarget && (
              <button
                type="button"
                className="btn small secondary"
                style={{ marginTop: 8 }}
                onClick={() => onChange({ ...panel, step: 'custom' })}
              >
                + Create custom exercise
              </button>
            )}
          </>
        )}

        {panel.step === 'custom' && (
          <>
            <div className="catalog-edit-grid">
              <input
                value={panel.custom.name}
                onChange={(e) => onChange({ ...panel, custom: { ...panel.custom, name: e.target.value } })}
                placeholder="Exercise name"
              />
              <input
                value={panel.custom.muscle_group}
                onChange={(e) => onChange({ ...panel, custom: { ...panel.custom, muscle_group: e.target.value } })}
                placeholder="Muscle group"
              />
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn small green" onClick={onCreateCustom}>
                Save & continue
              </button>
              <button type="button" className="btn small secondary" onClick={() => onChange({ ...panel, step: 'search' })}>
                Back
              </button>
            </div>
          </>
        )}

        {panel.step === 'configure' && panel.picked && (
          <>
            <div className="panel-picked">
              <b>{panel.picked.name}</b>
              <span className="muted">{catalogResultMeta(panel.picked)}</span>
            </div>
            {getExerciseThumb(panel.picked) && (
              <img
                className="panel-picked-img"
                src={getExerciseThumb(panel.picked) || ''}
                alt={panel.picked.name}
                referrerPolicy="no-referrer"
              />
            )}
            {hasExerciseGuide(panel.picked) && guide && onOpenGuide && (
              <button type="button" className="btn small secondary" style={{ marginTop: 8 }} onClick={() => onOpenGuide(guide)}>
                {guide.hasVideo ? 'Watch form' : 'Preview form guide'}
              </button>
            )}
            {panel.picked.instructions && <div className="panel-instructions">{panel.picked.instructions}</div>}
            <label>Exercise type</label>
            <div className="tabs">
              <button
                type="button"
                className={panel.config.mode === 'normal' ? 'active' : ''}
                onClick={() => onChange({ ...panel, config: { ...panel.config, mode: 'normal', supersetGroupId: null } })}
              >
                Normal
              </button>
              <button
                type="button"
                className={panel.config.mode === 'superset' ? 'active' : ''}
                onClick={() =>
                  onChange({
                    ...panel,
                    config: { ...panel.config, mode: 'superset', supersetGroupId: panel.config.supersetGroupId || '__new__' },
                  })
                }
              >
                Superset
              </button>
            </div>
            {panel.config.mode === 'superset' && (
              <>
                <label>Superset group</label>
                <select
                  value={panel.config.supersetGroupId || '__new__'}
                  onChange={(e) => onChange({ ...panel, config: { ...panel.config, supersetGroupId: e.target.value } })}
                >
                  <option value="__new__">Create new superset</option>
                  {supersetGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} ({g.count}/3)
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="row">
              <div>
                <label>Sets</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={panel.config.setCount}
                  onChange={(e) =>
                    onChange({ ...panel, config: { ...panel.config, setCount: Number(e.target.value) || sectionDefaultSets(panel.section) } })
                  }
                />
              </div>
              <div>
                <label>Target reps</label>
                <input
                  value={panel.config.targetReps}
                  onChange={(e) => onChange({ ...panel, config: { ...panel.config, targetReps: e.target.value } })}
                  placeholder="8-12"
                />
              </div>
            </div>
            <label>Starting weight (optional)</label>
            <input
              value={panel.config.targetWeight}
              onChange={(e) => onChange({ ...panel, config: { ...panel.config, targetWeight: e.target.value } })}
              placeholder="lb"
            />
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn green" onClick={onConfirm}>
                Add Exercise
              </button>
              <button type="button" className="btn secondary" onClick={() => onChange({ ...panel, step: 'search', picked: null })}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
