'use client';

import { useEffect, useState } from 'react';
import { formatDisplayDate, parseDisplayDate } from '../../lib/training/programCalendar';

type DateInputProps = {
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
  id?: string;
};

export default function DateInput({ value, onChange, disabled, id }: DateInputProps) {
  const [text, setText] = useState(() => formatDisplayDate(value));

  useEffect(() => {
    setText(formatDisplayDate(value));
  }, [value]);

  function commit(nextText = text) {
    const parsed = parseDisplayDate(nextText);
    if (parsed) {
      onChange(parsed);
      setText(formatDisplayDate(parsed));
      return;
    }
    setText(formatDisplayDate(value));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/yy"
      autoComplete="off"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}
