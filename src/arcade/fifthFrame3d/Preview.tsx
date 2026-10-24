import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FfScene, type ViewName } from './scene'
import './preview.css'

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'hero', label: 'Lane' },
  { id: 'pins', label: 'Pins' },
  { id: 'ball', label: 'Ball' },
]

export default function FifthFrame3DPreview() {
  const ref = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<FfScene | null>(null)
  const [params] = useSearchParams()
  const [view, setView] = useState<ViewName>((params.get('view') as ViewName) || 'hero')
  const [ready, setReady] = useState(false)
  const clean = params.get('clean') === '1'

  useEffect(() => {
    if (!ref.current) return
    const sc = new FfScene(ref.current)
    sceneRef.current = sc
    let alive = true
    const onResize = () => sc.resize()
    sc.build().then(() => {
      if (!alive) return
      sc.setView(view)
      if (new URLSearchParams(location.search).get('still') === '1') sc.renderOnce(); else sc.start()
      setReady(true)
      ;(globalThis as unknown as { __FF3D: unknown }).__FF3D = sc
    })
    window.addEventListener('resize', onResize)
    return () => { alive = false; window.removeEventListener('resize', onResize); sc.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { sceneRef.current?.setView(view) }, [view])

  return (
    <div className="ff3-root">
      <canvas ref={ref} className="ff3-canvas" />
      {!ready ? <div className="ff3-loading">Loading Neon Paradise…</div> : null}
      {!clean ? (
        <>
          <div className="ff3-top">
            <Link to="/" className="ff3-back">← Floor</Link>
            <div className="ff3-title">
              <span className="ff3-title__eyebrow">Visual target · preview</span>
              <span className="ff3-title__name">FIFTH FRAME</span>
            </div>
            <Link to="/fifth-frame" className="ff3-back ff3-back--ghost">Play</Link>
          </div>
          <div className="ff3-views" role="tablist">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={`ff3-view${view === v.id ? ' is-on' : ''}`} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
