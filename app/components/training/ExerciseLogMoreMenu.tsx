'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ExerciseLogMoreItemSpec } from '../../../lib/training/exerciseLogChrome';
import {
  exerciseLogMoreKeyCloses,
  exerciseLogMoreKeyDismisses,
  exerciseLogMoreKeyRestoresTrigger,
  exerciseLogMoreMenuIndex,
  exerciseLogMoreTriggerAttrs,
} from '../../../lib/training/exerciseLogChrome';

export type ExerciseLogMoreItem = ExerciseLogMoreItemSpec & {
  onSelect: () => void;
};

export default function ExerciseLogMoreMenu({ items }: { items: ExerciseLogMoreItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();

    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (exerciseLogMoreKeyCloses(e.key)) {
        e.preventDefault();
        setOpen(false);
        if (exerciseLogMoreKeyRestoresTrigger(e.key)) triggerRef.current?.focus();
        return;
      }
      if (exerciseLogMoreKeyDismisses(e.key) && e.key === 'Tab') {
        setOpen(false);
        return;
      }
      const currentIndex = itemRefs.current.findIndex((el) => el === document.activeElement);
      const next = exerciseLogMoreMenuIndex({
        key: e.key,
        currentIndex: currentIndex < 0 ? 0 : currentIndex,
        count: items.length,
      });
      if (next == null) return;
      e.preventDefault();
      itemRefs.current[next]?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, items.length]);

  if (!items.length) return null;

  return (
    <div className="exercise-log-more te-item-more" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn small secondary te-item-more-btn"
        {...exerciseLogMoreTriggerAttrs(open)}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (open || e.key !== 'ArrowDown') return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        More
      </button>
      {open && (
        <div id={menuId} className="te-item-menu exercise-log-more-menu" role="menu" aria-orientation="vertical">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`te-item-menu-btn${item.danger ? ' te-item-menu-btn-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
