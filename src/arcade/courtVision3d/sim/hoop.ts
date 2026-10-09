import type { CourtVisionSeedConfig } from '../../core/seededRandom'
import type { HoopPose } from './physics'

/** px → metres for legacy seed amplitudes (rim was ~97px for 0.457m). */
const PX_TO_M = 0.0047

/**
 * Hoop sway is OFF: the owner wants the hoop static and centered on every run.
 * Seeded rematch / set-the-bar tickets ('sway:*' seeds) used to swing the hoop
 * side to side, which read as a bug after "Run it back" on the VS screen. Seeds
 * still vary wind + ball spot; flip this only with an explicit, labeled mode.
 */
export const HOOP_SWAY_ENABLED = false

const CENTER: HoopPose = { x: 0, y: 0 }

/** Hoop pose at sim time t (s). Static/centered unless HOOP_SWAY_ENABLED. */
export function hoopPoseAt(cfg: CourtVisionSeedConfig | null, t: number): HoopPose {
  if (!cfg || !HOOP_SWAY_ENABLED) return CENTER
  const ang = t * 1000 * cfg.swaySpeed + cfg.swayPhase
  return {
    x: Math.sin(ang) * cfg.swayAmpX * PX_TO_M,
    y: Math.sin(ang * 1.37 + 0.6) * cfg.swayAmpY * PX_TO_M * 0.5,
  }
}
