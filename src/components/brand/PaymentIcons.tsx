// Simple, original flat-style card-network marks — not a copy of any
// competitor's icon files. These are informational ("we work with
// specialists who can process these payment types during booking"), not an
// on-site checkout; see the caption where this is rendered.

function VisaMark() {
  return (
    <svg viewBox="0 0 48 32" width="40" height="27" role="img" aria-label="Visa">
      <rect width="48" height="32" rx="4" fill="#ffffff" stroke="currentColor" strokeOpacity="0.12" />
      <text x="24" y="21" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="13" fill="#1a1f71">
        VISA
      </text>
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg viewBox="0 0 48 32" width="40" height="27" role="img" aria-label="Mastercard">
      <rect width="48" height="32" rx="4" fill="#ffffff" stroke="currentColor" strokeOpacity="0.12" />
      <circle cx="20" cy="16" r="9" fill="#eb001b" />
      <circle cx="28" cy="16" r="9" fill="#f79e1b" fillOpacity="0.92" />
    </svg>
  );
}

function AmexMark() {
  return (
    <svg viewBox="0 0 48 32" width="40" height="27" role="img" aria-label="American Express">
      <rect width="48" height="32" rx="4" fill="#006fcf" />
      <text x="24" y="20" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9.5" fill="#ffffff" letterSpacing="0.5">
        AMEX
      </text>
    </svg>
  );
}

function DiscoverMark() {
  return (
    <svg viewBox="0 0 48 32" width="40" height="27" role="img" aria-label="Discover">
      <rect width="48" height="32" rx="4" fill="#ffffff" stroke="currentColor" strokeOpacity="0.12" />
      <text x="17" y="20" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="6.5" fill="#1a1a1a">
        DISCOVER
      </text>
      <circle cx="41" cy="19" r="5" fill="#f68121" />
    </svg>
  );
}

export function PaymentIcons({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <VisaMark />
        <MastercardMark />
        <AmexMark />
        <DiscoverMark />
      </div>
    </div>
  );
}
