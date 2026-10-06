import type { CourtVisionSeedConfig } from '../../core/seededRandom'
import type { HoopPose } from './physics'

/** px → metres for legacy seed amplitudes (rim was ~97px for 0.457m). */
const PX_TO_M = 0.0047

/** Deterministic seeded hoop sway at sim time t (s). */
export function hoopPoseAt(cfg: CourtVisionSeedConfig | null, t: number): HoopPose {
  if (!cfg) return { x: 0, y: 0 }
  const ang = t * 1000 * cfg.swaySpeed + cfg.swayPhase
  return {
    x: Math.sin(ang) * cfg.swayAmpX * PX_TO_M,
    y: Math.sin(ang * 1.37 + 0.6) * cfg.swayAmpY * PX_TO_M * 0.5,
  }
}
