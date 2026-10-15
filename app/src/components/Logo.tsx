// 하트 폴라로이드 로고
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="pm-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD3DE" /><stop offset=".55" stopColor="#E6D9FF" /><stop offset="1" stopColor="#CDEBFF" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="34" fill="url(#pm-logo-g)" />
      <g transform="rotate(-8 60 60)">
        <rect x="33" y="27" width="54" height="66" rx="7" fill="#fff" />
        <rect x="39" y="33" width="42" height="41" rx="4" fill="#FFE8EE" />
        <path d="M60 67c-6.2-4.7-11.2-8.5-11.2-13.4a5.7 5.7 0 0 1 11.2-1.7 5.7 5.7 0 0 1 11.2 1.7C71.2 58.5 66.2 62.3 60 67z" fill="#F38FAA" />
        <rect x="45" y="80" width="30" height="3.4" rx="1.7" fill="#E9DDF0" />
      </g>
    </svg>
  );
}
