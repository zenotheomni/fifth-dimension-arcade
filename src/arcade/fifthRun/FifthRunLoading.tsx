/** Suspense fallback shown while the Fifth Glide chunk (three.js) streams in. Kept tiny + inline-styled. */
export default function FifthRunLoading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, #2a1648, #0b0716 75%)',
        color: '#ffc83c',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        fontSize: '0.8rem',
        fontWeight: 700,
      }}
    >
      Loading Fifth Glide…
    </div>
  )
}
