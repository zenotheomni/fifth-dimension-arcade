"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cabinets } from "@/arcade/core/cabinetConfig";
import { getOrCreatePlayerId } from "@/arcade/core/identity";
import { track } from "@/arcade/analytics";

const DOCK_ITEMS = [
  { id: "boutique", label: "Boutique" },
  { id: "record-store", label: "Record Store" },
  { id: "theater", label: "Theater" },
] as const;

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export default function LobbyPage() {
  const isDesktop = useIsDesktop();
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    const data = encodeURIComponent(`${window.location.origin}/arcade`);
    setQrSrc(
      `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`,
    );
  }, []);

  useEffect(() => {
    getOrCreatePlayerId();
    track("arcade_lobby_view");
  }, []);

  useEffect(() => {
    if (isDesktop) {
      track("arcade_desktop_qr_view");
    }
  }, [isDesktop]);

  const firstLive = cabinets.find((c) => c.status === "live");

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--ink" aria-hidden />
      <div className="arcade-glow arcade-glow--signal" aria-hidden />
      <div className="arcade-glow arcade-glow--mint" aria-hidden />

      <div className="arcade-lobby-mobile">
        <div className="arcade-lobby">
          <header className="arcade-ticket" aria-label="The Fifth Floor">
            The Fifth Floor
          </header>

          <div className="arcade-cabinets" role="list">
            {cabinets.map((cabinet) => {
              const isLive = cabinet.status === "live" && cabinet.route;
              const inner = (
                <>
                  <div className="arcade-cabinet__glass" aria-hidden />
                  <span className="arcade-cabinet__status">
                    {isLive ? "Live" : "Coming"}
                  </span>
                  {cabinet.badge ? (
                    <span className="arcade-cabinet__badge">{cabinet.badge}</span>
                  ) : null}
                  <h2 className="arcade-cabinet__title">{cabinet.title}</h2>
                  <p className="arcade-cabinet__tagline">{cabinet.tagline}</p>
                </>
              );

              if (isLive) {
                return (
                  <Link
                    key={cabinet.id}
                    href={cabinet.route!}
                    className="arcade-cabinet arcade-cabinet--live"
                    role="listitem"
                    onClick={() =>
                      track("arcade_cabinet_tap", {
                        cabinet: cabinet.id,
                        status: cabinet.status,
                      })
                    }
                  >
                    {inner}
                  </Link>
                );
              }

              return (
                <div
                  key={cabinet.id}
                  className="arcade-cabinet arcade-cabinet--coming"
                  role="listitem"
                  aria-disabled="true"
                >
                  {inner}
                </div>
              );
            })}
          </div>

          {firstLive ? (
            <p className="arcade-teaser">
              <strong>BEAT JENKS&apos;S</strong> score — placeholder challenge
              teaser
            </p>
          ) : null}

          <nav className="arcade-dock" aria-label="Floor destinations">
            {DOCK_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="arcade-dock__btn"
                onClick={() => track("arcade_dock_tap", { dock: item.id })}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="arcade-desktop-gate">
        <p className="arcade-ticket">The Fifth Floor</p>
        <h1 className="arcade-desktop-gate__title">Open on your phone</h1>
        <p className="arcade-desktop-gate__copy">
          Night arcade lives best in your hand. Scan to step onto the floor.
        </p>
        {qrSrc ? (
          // External QR generator; next/image not required for M1 stub.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="arcade-desktop-gate__qr"
            src={qrSrc}
            width={220}
            height={220}
            alt="QR code linking to the arcade lobby"
          />
        ) : (
          <div className="arcade-desktop-gate__qr" aria-hidden />
        )}
      </div>
    </div>
  );
}
