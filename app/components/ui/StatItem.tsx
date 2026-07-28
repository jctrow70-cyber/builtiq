import type { ReactNode } from 'react';

type StatItemProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
};

export default function StatItem({ label, value, icon }: StatItemProps) {
  return (
    <div className="ui-stat-item">
      {icon && <span className="ui-stat-item-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-stat-item-label">{label}</span>
      <span className="ui-stat-item-value">{value}</span>
    </div>
  );
}
