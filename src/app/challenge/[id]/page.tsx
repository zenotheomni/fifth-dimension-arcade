"use client";

import { useParams } from "next/navigation";
import PlaceholderShell from "@/components/PlaceholderShell";

export default function ChallengePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "—";

  return (
    <PlaceholderShell
      ticket="Challenge"
      title="Challenge"
      copy="Challenge links land in M3. Almost. Rearrange. Run it back."
      event="arcade_challenge_shell_view"
      idLabel={id}
    />
  );
}
