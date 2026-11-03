import { canonicalEquipment } from './equipmentIdentity';

export type EquipmentIntent = {
  generation: number;
  value: string;
};

export type EquipmentSnapshotChoice =
  | { ok: true; equipment: string }
  | { ok: false; equipment: ''; reason: string };

export function beginEquipmentChange(previous: EquipmentIntent | undefined, value: string): EquipmentIntent {
  return {
    generation: (previous?.generation || 0) + 1,
    value: String(value || '').trim(),
  };
}

export function equipmentWriteIsCurrent(latest: EquipmentIntent | undefined, write: EquipmentIntent): boolean {
  return !!latest && latest.generation === write.generation && latest.value === write.value;
}

/**
 * The set stores the equipment the athlete selected, including a selection that
 * has not finished saving. A multi-implement exercise with nothing selected
 * cannot be logged. A single legal implement can be stored because the badge
 * shows it. An empty exercise with no options stays unspecified.
 */
export function equipmentForSetSnapshot(input: {
  persisted?: string | null;
  pending?: string | null;
  options?: string[] | null;
}): EquipmentSnapshotChoice {
  const pending = String(input.pending || '').trim();
  const persisted = String(input.persisted || '').trim();
  const options = (input.options || []).map((option) => String(option || '').trim()).filter(Boolean);
  const selected = pending || persisted;
  if (!selected) {
    if (options.length > 1) {
      return { ok: false, equipment: '', reason: 'Choose the equipment for this exercise before logging a set.' };
    }
    if (options.length === 1) return { ok: true, equipment: options[0] };
    return { ok: true, equipment: '' };
  }
  const selectedKey = canonicalEquipment(selected).key;
  const match = options.find((option) => canonicalEquipment(option).key === selectedKey);
  return { ok: true, equipment: match || selected };
}

export type EquipmentWriteQueue = {
  intent: () => EquipmentIntent | undefined;
  enqueue: (value: string, persist: (value: string, isCurrent: () => boolean) => Promise<void>) => EquipmentIntent;
  done: () => Promise<void>;
};

/** Per-exercise chain. An older save cannot be the last write. */
export function createEquipmentWriteQueue(): EquipmentWriteQueue {
  let chain: Promise<void> = Promise.resolve();
  let latest: EquipmentIntent | undefined;
  return {
    intent: () => latest,
    enqueue(value, persist) {
      const intent = beginEquipmentChange(latest, value);
      latest = intent;
      const job = chain.catch(() => undefined).then(async () => {
        if (!equipmentWriteIsCurrent(latest, intent)) return;
        await persist(intent.value, () => equipmentWriteIsCurrent(latest, intent));
      });
      chain = job;
      return intent;
    },
    done: () => chain,
  };
}
