'use client';

type DateInputProps = {
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
  id?: string;
};

/** Native calendar date picker. Value is YYYY-MM-DD. */
export default function DateInput({ value, onChange, disabled, id }: DateInputProps) {
  return (
    <input
      id={id}
      type="date"
      value={value || ''}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        if (next) onChange(next);
      }}
    />
  );
}
