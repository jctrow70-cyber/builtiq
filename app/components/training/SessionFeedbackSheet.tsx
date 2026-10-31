'use client';

import { useEffect, useRef } from 'react';
import type { PainFlag, SessionStatus, SkipReason, WorkoutFeel } from '../../../lib/scienceEngine/adaptation/types';
import { previewDialogKeyCloses, previewDialogTabWrap } from '../../../lib/training/trainingPreview';
import SessionOutcomeCard from './SessionOutcomeCard';

const SHEET_FOCUSABLE =
  'a[href], button:not([disabled]), summary, textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type SessionFeedbackSheetProps = {
  status: SessionStatus;
  feel: WorkoutFeel | '';
  pain: PainFlag | '';
  notes: string;
  skipReason: SkipReason | '';
  canEdit: boolean;
  pendingMigration?: boolean;
  notice?: string | null;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  onStatus: (status: SessionStatus) => void;
  onFeel: (feel: WorkoutFeel) => void;
  onPain: (pain: PainFlag) => void;
  onNotes: (notes: string) => void;
  onSkipReason: (reason: SkipReason) => void;
};

/** Presentation-only sheet. Close/Escape never writes session status. */
export default function SessionFeedbackSheet({
  returnFocusTo,
  onClose,
  ...card
}: SessionFeedbackSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocusTo);
  onCloseRef.current = onClose;
  returnFocusRef.current = returnFocusTo;

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusables = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE)).filter(
            (el) => !el.hasAttribute('disabled')
          )
        : [];
    (closeRef.current || focusables()[0] || dialog)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (previewDialogKeyCloses(event.key)) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const items = focusables();
      if (!items.length) return;
      const activeIndex = items.findIndex((el) => el === document.activeElement);
      if (event.key === 'Tab' && activeIndex < 0) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0]?.focus();
        return;
      }
      const wrapTo = previewDialogTabWrap(event.key, event.shiftKey, activeIndex, items.length);
      if (wrapTo == null) return;
      event.preventDefault();
      items[wrapTo]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, []);

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="session-feedback-sheet card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-feedback-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2 id="session-feedback-title">How did it go?</h2>
          <button ref={closeRef} type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <SessionOutcomeCard {...card} embedded defaultExpanded />
      </div>
    </div>
  );
}
