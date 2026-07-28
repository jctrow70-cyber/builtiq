import type { ReactNode, HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  elevated?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

export default function Card({
  children,
  className = '',
  elevated = false,
  padding = 'md',
  ...rest
}: CardProps) {
  const padClass =
    padding === 'none'
      ? 'ui-card--pad-none'
      : padding === 'sm'
        ? 'ui-card--pad-sm'
        : padding === 'lg'
          ? 'ui-card--pad-lg'
          : '';
  return (
    <div
      className={`ui-card${elevated ? ' ui-card--elevated' : ''} ${padClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
