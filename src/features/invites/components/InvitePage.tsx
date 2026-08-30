"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { acceptInvite } from "@/data/invites";

export default function InvitePage() {
  const params = useParams<{ inviterId: string }>();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Invite acceptance is intentionally triggered once by the route entry.
  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    if (!params.inviterId || started.current) return;
    started.current = true;

    acceptInvite(params.inviterId)
      .then((data) => window.location.replace(`/profile/${data.profile_id}`))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "We couldn't accept this invitation.");
      });
  }, [attempt, params.inviterId]);

  const retry = () => {
    started.current = false;
    setError(null);
    setAttempt((current) => current + 1);
  };

  return (
    <main className="min-h-[70vh] px-6 flex items-center justify-center">
      <Card className="w-full max-w-sm p-6 flex flex-col items-center gap-4 text-center">
        {error ? (
          <>
            <h1 className="font-display text-xl font-bold text-foreground">Couldn&apos;t accept invite</h1>
            <p role="alert" className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="secondary" onClick={retry}>Try again</Button>
          </>
        ) : (
          <>
            <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Opening invitation…</p>
          </>
        )}
      </Card>
    </main>
  );
}
