'use client';

import { forwardRef } from 'react';

type DateInputProps = {
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
};

function toDateInputValue(value: string | null | undefined): string {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

/** Native calendar date picker. Value is YYYY-MM-DD. */
const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onChange, disabled, id, className, 'aria-label': ariaLabel },
  ref
) {
  return (
    <input
      ref={ref}
      id={id}
      type="date"
      className={className}
      value={toDateInputValue(value)}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = toDateInputValue(e.target.value);
        if (next) onChange(next);
      }}
    />
  );
});

export default DateInput;
