'use client';

function NavIcon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  switch (name) {
    case 'Dashboard':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'Training':
      return (
        <svg {...common}>
          <path d="M6 7h12M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M7 11h10M9 15h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="5" y="7" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'Groups':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 19c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5M14 19c0-1.8 1.6-3.2 3.5-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'Nutrition':
      return (
        <svg {...common}>
          <path d="M12 3c3 4 5 6.5 5 10a5 5 0 1 1-10 0c0-3.5 2-6 5-10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'Progress':
      return (
        <svg {...common}>
          <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8 15v-3M12 15V8M16 15v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/** Core daily destinations — Progress restored so history/PRs are one tap away. */
const PRIMARY_NAV = ['Dashboard', 'Training', 'Groups', 'Nutrition', 'Progress'] as const;

type PrimaryNavProps = {
  active: string;
  onNavigate: (section: string) => void;
};

export default function PrimaryNav({ active, onNavigate }: PrimaryNavProps) {
  return (
    <nav className="primary-nav primary-nav--five" aria-label="Primary">
      {PRIMARY_NAV.map((item) => {
        const isActive = active === item;
        return (
          <button
            key={item}
            type="button"
            className={`primary-nav-item${isActive ? ' primary-nav-item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item)}
          >
            <span className="primary-nav-icon">
              <NavIcon name={item} />
            </span>
            <span className="primary-nav-label">{item}</span>
          </button>
        );
      })}
    </nav>
  );
}
