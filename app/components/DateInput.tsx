'use client';

import { forwardRef } from 'react';

type DateInputProps = {
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/** Native calendar date picker. Value is YYYY-MM-DD. */
const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onChange, disabled, id, className },
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
      onChange={(e) => {
        const next = e.target.value;
        if (next) onChange(next);
      }}
    />
  );
});

export default DateInput;
