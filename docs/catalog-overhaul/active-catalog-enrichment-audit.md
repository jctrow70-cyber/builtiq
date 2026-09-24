# Active catalog enrichment audit (quality pass, review only)

Generated: 2026-09-23T16:11:49.549Z

**Not applied to production.** Inactive/legacy exercises were not enriched. Phase 2 was not started.

## Counts

| Metric | Value |
|---|---|
| Live query | TypeError: fetch failed |
| Active exercises | 260 |
| High-confidence / no review | 254 |
| Review required | 6 |
| Missing primary muscles | 0 |
| With hypertrophy volume credits | 185 |
| Zero hypertrophy volume credit | 75 |
| Anomalies | 0 |
| Artifact source | local builtiq_master library |

## Distributions

- Movement patterns: {"other":77,"core_anti_extension":5,"vertical_push":10,"vertical_pull":9,"hinge":24,"squat":21,"horizontal_push":16,"horizontal_pull":17,"elbow_flexion":6,"core_flexion":8,"core_anti_rotation":4,"jump":6,"lunge":11,"core_rotation":4,"shoulder_abduction":5,"knee_flexion":5,"calf_raise":7,"olympic":9,"core_anti_lateral_flexion":2,"carry":4,"elbow_extension":4,"core_lateral_flexion":2,"throw":3,"power":1}
- Laterality: {"bilateral":218,"unilateral":35,"alternating":7}
- Measurement: {"reps":236,"time":17,"distance":7}
- Fatigue: {"low":127,"medium":96,"high":37}
- Volume policy: {"zero_non_hypertrophy":75,"core":24,"strength_hypertrophy":160,"power_reduced":1}

## Review-required exercises

- **Cable Y Raise**: primary_lower_trap_vs_rear_delt_ambiguity
- **Copenhagen Plank**: dual_identity_adductor_and_anti_lateral_flexion
- **Jefferson Curl**: loaded_spinal_flexion_programming_risk
- **Overhead Carry**: laterality_implementation_ambiguous_single_vs_double_arm
- **Upright Row**: shoulder_impingement_and_pattern_debate
- **Y Raise**: primary_lower_trap_vs_rear_delt_ambiguity

## Quality-pass rules

- Exact/contextual mappings replace ambiguous substring rules (`curl`, `plank`, `jump`, `row`)
- Laterality is bilateral / unilateral / alternating and is not inferred from the absence of "single"
- Measurement supports reps, time, and distance
- Ramp eligibility is for loaded/technical working movements, not "compound" alone
- Fatigue is programming/recovery cost
- Muscle involvement is separate from conservative hypertrophy volume credit
- Warmup, mobility, most conditioning, carries, and Olympic/power work normally receive zero hypertrophy set credit
- `review_required` now means genuine ambiguity or programming risk, not a missing old-database field

## How to apply later

1. Review `active-catalog-enrichment-review.csv`
2. Accept/edit `proposed` fields
3. Write accepted values into `coaching_metadata` (and `movement_pattern` / `muscle_targets` where justified) **for these active IDs only**
4. Do not unarchive, delete, or enrich inactive rows
