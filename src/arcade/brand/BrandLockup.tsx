/** Fifth Dimension full-colour 5D logo with "FIFTH FLOOR ARCADE" under it — used on every card + loading screen. */
const BASE = import.meta.env.BASE_URL
export const BRAND_LOGO = `${BASE}art/5d-logo-color.png`

export default function BrandLockup({ size = 64, label = true, className }: { size?: number; label?: boolean; className?: string }) {
  return (
    <span className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(size * 0.08) }}>
      <img
        src={BRAND_LOGO}
        alt="Fifth Dimension 5D logo"
        width={size}
        height={size}
        style={{ display: 'block', width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.9) 55%, rgba(255,255,255,0) 72%)', boxShadow: '0 0 14px 4px rgba(255,240,210,0.55), 0 0 30px 8px rgba(255,200,60,0.25)' }}
      />
      {label ? (
        <span style={{ fontSize: Math.max(9, Math.round(size * 0.17)), letterSpacing: '0.18em', fontWeight: 800, color: '#ffc83c', whiteSpace: 'nowrap', lineHeight: 1 }}>
          FIFTH FLOOR ARCADE
        </span>
      ) : null}
    </span>
  )
}
