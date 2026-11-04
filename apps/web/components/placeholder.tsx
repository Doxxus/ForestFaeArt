/** The one placeholder shown for any piece without a photo (IMG-9). Drawn at display time, never stored. */
export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="Photo coming soon" className={className}>
      <rect width="120" height="120" fill="#EFE6CF" />
      <rect x="22" y="18" width="76" height="84" rx="3" fill="none" stroke="#86522A" strokeWidth="2.5" />
      <rect x="29" y="25" width="62" height="70" fill="none" stroke="#B4733A" strokeWidth="1" />
      {/* a small moth */}
      <g fill="#2F4A3A" opacity="0.8">
        <path d="M60 52 C48 40 34 46 36 58 C37 66 48 68 58 62 Z" />
        <path d="M60 52 C72 40 86 46 84 58 C83 66 72 68 62 62 Z" />
        <path d="M58 64 C50 70 46 80 52 84 C57 82 59 74 59 66 Z" />
        <path d="M62 64 C70 70 74 80 68 84 C63 82 61 74 61 66 Z" />
        <rect x="59" y="50" width="2" height="20" rx="1" />
      </g>
      <text x="60" y="108" textAnchor="middle" fontSize="7" fill="#556B3A" fontFamily="Georgia, serif">
        Photo coming soon
      </text>
    </svg>
  );
}
