import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  variant?: 'ghost' | 'soft' | 'solid';
  size?: 'sm' | 'md';
};

export default function IconButton({
  label,
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`ui-icon-btn ui-icon-btn--${variant} ui-icon-btn--${size} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
