/** Scale-of-justice mark inside a shield, with an emerald/indigo glow. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden>
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400/40 to-indigo-500/40 blur-md" />
      <svg viewBox="0 0 36 36" className="relative h-full w-full">
        <defs>
          <linearGradient id="lv-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
        <path d="M18 2.5l12.5 4.6v9.4c0 8-5.4 14.2-12.5 16.9C10.9 30.7 5.5 24.5 5.5 16.5V7.1z" fill="#0b1020" stroke="url(#lv-stroke)" strokeWidth="1.6" />
        <path d="M18 9v15M12 12.5h12M12 12.5l-2.6 6h5.2zM24 12.5l-2.6 6h5.2z" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 25.5h8" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">LexVeritas</span>
    </span>
  )
}
