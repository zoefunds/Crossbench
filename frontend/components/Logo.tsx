export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4CD7F6" />
            <stop offset="1" stopColor="#FFB95F" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="8" fill="#0A0E16" />
        <line x1="32" y1="14" x2="32" y2="46" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="14" y1="22" x2="50" y2="22" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="14" cy="22" r="2.5" fill="url(#logoGrad)" />
        <circle cx="50" cy="22" r="2.5" fill="url(#logoGrad)" />
        <circle cx="32" cy="14" r="2.5" fill="url(#logoGrad)" />
        <path d="M8 30 L14 22 L20 30 A6 6 0 0 1 8 30 Z" fill="none" stroke="#4CD7F6" strokeWidth="2" strokeLinejoin="round" />
        <path d="M44 30 L50 22 L56 30 A6 6 0 0 1 44 30 Z" fill="none" stroke="#FFB95F" strokeWidth="2" strokeLinejoin="round" />
        <rect x="24" y="46" width="16" height="4" rx="1" fill="url(#logoGrad)" />
      </svg>
      <span className="font-headline font-bold text-lg tracking-tight text-text-ec">Crossbench</span>
    </div>
  );
}
