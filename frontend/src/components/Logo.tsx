// F2A brand mark (blue tile with an orange flame/drop – heating & fluids).
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="F2A">
      <rect width="64" height="64" rx="14" fill="#174B83" />
      <path d="M46 8c5 7 8 11 8 16a8 8 0 0 1-16 0c0-5 3-9 8-16z" fill="#E9A12C" />
      <text x="7" y="50" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="25" fill="#fff">F2A</text>
    </svg>
  );
}

export function Logo({ light = false, subtitle }: { light?: boolean; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className={`text-base font-extrabold tracking-tight ${light ? "text-white" : "text-navy"}`}>F2A TRAVAUX</div>
        <div className="text-[11px] font-semibold text-accent">{subtitle ?? "Fluides & Travaux"}</div>
      </div>
    </div>
  );
}
