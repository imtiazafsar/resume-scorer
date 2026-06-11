import React from 'react';
import s from './Nav.module.css';

const TABS = [
  { label: 'General',    path: '/',            icon: '📋', desc: 'AI resume score & feedback' },
  { label: 'Job Match',  path: '/job-match',   icon: '🎯', desc: 'Score against a specific role' },
  { label: 'LinkedIn',   path: '/linkedin',    icon: '💼', desc: 'Optimise your LinkedIn profile', badge: 'New' },
  { label: 'Enterprise', path: '/enterprise',  icon: '🏢', desc: 'Bulk candidate screening' },
];

export default function Nav({ active }) {
  return (
    <nav className={s.nav}>
      <a href="/" className={s.brand}>
        <span className={s.brandMark}>RS</span>
        <span className={s.brandName}>Resume Scorer</span>
      </a>

      <div className={s.tabs}>
        {TABS.map(tab => (
          <a
            key={tab.path}
            href={tab.path}
            className={active === tab.label ? s.tabOn : s.tab}
            title={tab.desc}
          >
            <span className={s.tabIcon}>{tab.icon}</span>
            {tab.label}
            {tab.badge && active !== tab.label && (
              <span className={s.tabBadge}>{tab.badge}</span>
            )}
          </a>
        ))}
      </div>
    </nav>
  );
}
