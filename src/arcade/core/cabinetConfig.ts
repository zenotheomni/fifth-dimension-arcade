export type CabinetStatus = "live" | "coming";

export type Cabinet = {
  id: string;
  title: string;
  tagline: string;
  status: CabinetStatus;
  /** Shown on cabinet glass when set (e.g. NEW) */
  badge?: string;
  /** App-router path; Next.js basePath prefixes /arcade */
  route?: string;
};

/**
 * Lobby cabinets — Creative Brief order.
 * live = playable shell / glow. coming = dimmed COMING UP teaser.
 */
export const cabinets: Cabinet[] = [
  {
    id: "court-vision",
    title: "Court Vision",
    tagline: "Finger-flick basketball. Hold. Aim. Release.",
    status: "live",
    badge: "NEW",
    route: "/court-vision",
  },
  {
    id: "fifth-run",
    title: "Fifth Run",
    tagline: "3-lane night runner. Swipe. Jump. Slide.",
    status: "live",
    route: "/fifth-run",
  },
  {
    id: "break-and-rack",
    title: "Break & Rack",
    tagline: "Table games. Coming to the floor.",
    status: "coming",
  },
  {
    id: "lane-drift",
    title: "Lane Drift",
    tagline: "Side-scroll drift. Coming to the floor.",
    status: "coming",
  },
];
