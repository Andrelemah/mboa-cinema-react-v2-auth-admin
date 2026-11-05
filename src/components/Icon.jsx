const icons = {
  "search": <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  "chevron-down": <><path d="m6 9 6 6 6-6"/></>,
  "chevron-right": <><path d="m9 6 6 6-6 6"/></>,
  "arrow-right": <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  "arrow-left": <><path d="M20 12H4m6-6-6 6 6 6"/></>,
  "arrow-down": <><path d="M12 4v16m-6-6 6 6 6-6"/></>,
  "arrow-up-right": <><path d="M7 17 17 7M7 7h10v10"/></>,
  "plus": <><path d="M12 5v14M5 12h14"/></>,
  "check": <><path d="m5 12 4 4L19 6"/></>,
  "x": <><path d="m6 6 12 12M6 18 18 6"/></>,
  "play": <><path d="m9 5 11 7-11 7Z" fill="currentColor" strokeWidth="1"/></>,
  "home": <><path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/></>,
  "film": <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4"/></>,
  "stories": <><path d="M4 4h7l1 2 1-2h7v15h-7l-1 2-1-2H4ZM12 6v15"/></>,
  "bookmark": <><path d="M6 3h12v18l-6-4-6 4Z"/></>,
  "ticket": <><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Zm13 0v12"/></>,
  "phone": <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4M10 5h4"/></>,
  "monitor": <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  "tv": <><rect x="2" y="6" width="20" height="15" rx="2"/><path d="m8 2 4 4 4-4"/></>,
  "users": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/></>,
  "globe": <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/></>,
  "info": <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/></>,
  "shield": <><path d="m12 2 8 4v6c0 5-8 10-8 10s-8-5-8-10V6Zm-4 10 3 3 5-6"/></>,
  "settings": <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></>,
  "captions": <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9H6v6h4m9-6h-4v6h4"/></>,
  "headphones": <><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></>,
  "lock": <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  "spark": <><path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/></>,
  "library": <><path d="M4 4v16M8 3v17M12 5v15m4-15 5 14M3 21h19"/></>,
  "grid": <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>
};

export default function Icon({name, className = '', ...props}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>{icons[name] || icons.film}</svg>;
}
