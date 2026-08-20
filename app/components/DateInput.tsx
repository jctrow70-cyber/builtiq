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
      value={value || ''}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = e.target.value;
        if (next) onChange(next);
      }}
    />
  );
});

export default DateInput;
