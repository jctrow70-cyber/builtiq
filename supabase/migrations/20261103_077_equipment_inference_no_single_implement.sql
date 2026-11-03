-- BIQ-0301
-- Replaces st_infer_snapshot_equipment so a single legal implement is no longer guessed.
-- Does not update existing rows. Rows already backfilled by 20261008_060 stay as they are.
-- Do not apply this migration until it is reviewed.

create or replace function public.st_infer_snapshot_equipment(
  p_existing text,
  p_name text,
  p_options text[]
)
returns jsonb
language plpgsql
immutable
as $$
declare
  existing text := nullif(trim(coalesce(p_existing, '')), '');
  name_l text := lower(coalesce(p_name, ''));
  opt text;
  hits text[] := '{}';
  longest text;
  contained boolean := true;
  other text;
begin
  if existing is not null then
    return jsonb_build_object('equipment', existing, 'provenance', 'snapshotted', 'detail', 'existing');
  end if;

  if p_options is not null then
    foreach opt in array p_options loop
      if opt is not null and length(trim(opt)) > 0 and position(lower(trim(opt)) in name_l) > 0 then
        hits := array_append(hits, trim(opt));
      end if;
    end loop;
  end if;

  if coalesce(cardinality(hits), 0) > 1 then
    select h into longest from unnest(hits) as h order by length(h) desc, h limit 1;
    foreach other in array hits loop
      if lower(other) <> lower(longest) and position(lower(other) in lower(longest)) = 0 then
        contained := false;
      end if;
    end loop;
    if contained then
      hits := array[longest];
    end if;
  end if;

  if coalesce(cardinality(hits), 0) = 1 then
    return jsonb_build_object('equipment', hits[1], 'provenance', 'backfilled', 'detail', 'logged_name');
  end if;

  return jsonb_build_object('equipment', null, 'provenance', 'unknown', 'detail', 'unspecified');
end;
$$;
