export type Phase = 'howto' | 'aim' | 'rolling' | 'settle' | 'frameend' | 'ended'

export type Hud = {
  phase: Phase
  score: number
  frame: number // 1..10
  ballInFrame: number // 1..3
  standing: number
  callout: string | null
  pb: number
  frames: FrameMark[]
  hint: string
}

export type FrameMark = {
  /** ball scores shown in the two (or three) boxes */
  rolls: (number | 'X' | '/' | null)[]
  /** cumulative score once known */
  total: number | null
}

export type EndStats = {
  score: number
  strikes: number
  spares: number
  pb: number
  newPb: boolean
}
