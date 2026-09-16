"use client";

import { useEffect } from "react";
import Link from "next/link";
import { track } from "@/arcade/analytics";

type Props = {
  ticket: string;
  title: string;
  copy: string;
  event: string;
  idLabel?: string;
  ctaLabel?: string;
};

export default function PlaceholderShell({
  ticket,
  title,
  copy,
  event,
  idLabel,
  ctaLabel,
}: Props) {
  useEffect(() => {
    track(event, idLabel ? { id: idLabel } : {});
  }, [event, idLabel]);

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--ink" aria-hidden />
      <div className="arcade-glow arcade-glow--signal" aria-hidden />
      <div className="arcade-shell">
        <p className="arcade-ticket">{ticket}</p>
        <h1 className="arcade-shell__title">{title}</h1>
        {idLabel ? <p className="arcade-shell__id">{idLabel}</p> : null}
        <p className="arcade-shell__copy">{copy}</p>
        <div className="arcade-shell__actions">
          {ctaLabel ? (
            <Link href="/" className="arcade-soft-cta">
              {ctaLabel}
            </Link>
          ) : null}
          <Link href="/" className="arcade-back">
            ← Back to The Fifth Floor
          </Link>
        </div>
      </div>
    </div>
  );
}
