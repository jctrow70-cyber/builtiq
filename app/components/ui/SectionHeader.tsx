import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export default function SectionHeader({
  title,
  subtitle,
  actions,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`ui-section-header ${className}`.trim()}>
      <div className="ui-section-header-text">
        <h1 className="ui-section-title">{title}</h1>
        {subtitle && <p className="ui-section-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-section-header-actions">{actions}</div>}
    </div>
  );
}
