/** Fifth Dimension full-colour 5D logo with "FIFTH FLOOR ARCADE" under it — used on every card + loading screen. */
const BASE = import.meta.env.BASE_URL
export const BRAND_LOGO = `${BASE}art/5d-logo-color.png`
/** Transparent logo + soft warm halo (cream → gold) so the black ring and palms read on dark cards. No solid disc. */
export const BRAND_GLOW = {
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(255,244,222,0.62) 0%, rgba(255,226,160,0.42) 42%, rgba(255,200,60,0.16) 62%, rgba(255,200,60,0) 71%)',
  filter: 'drop-shadow(0 0 1.5px rgba(255,244,222,0.9)) drop-shadow(0 0 8px rgba(255,200,60,0.5))',
} as const

export default function BrandLockup({ size = 64, label = true, className }: { size?: number; label?: boolean; className?: string }) {
  return (
    <span className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(size * 0.08) }}>
      <img
        src={BRAND_LOGO}
        alt="Fifth Dimension 5D logo"
        width={size}
        height={size}
        style={{ display: 'block', width: size, height: size, ...BRAND_GLOW }}
      />
      {label ? (
        <span style={{ fontSize: Math.max(9, Math.round(size * 0.17)), letterSpacing: '0.18em', fontWeight: 800, color: '#ffc83c', whiteSpace: 'nowrap', lineHeight: 1 }}>
          FIFTH FLOOR ARCADE
        </span>
      ) : null}
    </span>
  )
}
