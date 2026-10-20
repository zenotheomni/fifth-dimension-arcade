/** Fifth Dimension white wordmark (with its own dark drop shadow) + optional "FIFTH FLOOR ARCADE" label.
 *  Used for every top / header logo in Fifth Glide; the colour circle logo is only the power-up + backpack. */
export const WORDMARK = `${import.meta.env.BASE_URL}art/5d-wordmark-white.png`

export default function GlideWordmark({ width = 200, label = true }: { width?: number; label?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(width * 0.05) }}>
      <img
        src={WORDMARK}
        alt="Fifth Dimension"
        width={width}
        height={Math.round(width * 0.482)}
        draggable={false}
        style={{ display: 'block', width, height: 'auto', filter: 'drop-shadow(0 2px 6px rgba(8, 2, 20, 0.7))' }}
      />
      {label ? (
        <span style={{ fontSize: Math.max(9, Math.round(width * 0.075)), letterSpacing: '0.18em', paddingLeft: '0.18em', fontWeight: 800, color: '#ffc83c', whiteSpace: 'nowrap', lineHeight: 1 }}>
          FIFTH FLOOR ARCADE
        </span>
      ) : null}
    </span>
  )
}
