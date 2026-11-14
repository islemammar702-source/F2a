/* eslint-disable @next/next/no-img-element */
// Official F2A TRAVAUX logo (house + snowflake + flame). Files live in /public.

// Square mark (icon only): used for small spots such as the settings fallback.
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return <img src="/logo-mark.png" alt="F2A Travaux" className={`${className} object-contain`} />;
}

// Full logo (icon + "F2A TRAVAUX"). The JPG has a white background, so it always sits
// on a white rounded card; this keeps it clean on the dark sidebar/footer (light=true).
export function Logo({ light = false, subtitle }: { light?: boolean; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`inline-flex rounded-xl bg-white px-1.5 py-1 ${light ? "shadow-sm" : ""}`}>
        <img src="/logo-f2a.png" alt="F2A Travaux" className="h-11 w-auto" />
      </span>
      {subtitle && (
        <span className={`text-[11px] font-bold tracking-wider ${light ? "text-white/80" : "text-accent"}`}>{subtitle}</span>
      )}
    </div>
  );
}
