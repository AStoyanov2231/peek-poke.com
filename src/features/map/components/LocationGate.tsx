"use client";
import Link from "next/link";
import { Loader2, MapPin, ArrowLeft } from "lucide-react";
import { useLocationStatus, useUserLocation } from "@/stores/selectors";
export function LocationGate({ pending, onRetry, requested = true }: { pending: boolean; onRetry: () => void; requested?: boolean }) {
  const userLocation = useUserLocation(); const status = useLocationStatus();
  if (userLocation) return null;
  const locating = requested && status !== "denied" && status !== "error";
  return <section className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 overflow-y-auto bg-background px-7 py-10 text-center pointer-events-auto md:left-[240px]" aria-label="Location for nearby discovery">
    <span className="empty-ripple">{locating ? <Loader2 size={27} className="animate-spin"/> : <MapPin size={27}/>}</span>
    <h1 className="text-3xl font-semibold tracking-[-.05em]">{status === "denied" ? "Location is off. You’re still welcome." : status === "error" ? "Let’s find your area." : locating ? "Finding your little corner." : "Good company could be around the corner."}</h1>
    <p className="max-w-sm text-sm leading-relaxed text-ink-6">{status === "denied" ? "To use the map, allow location for this site in your browser settings. Your Inbox and Plans are still here." : "Location helps you find people nearby. Your precise position isn’t shown to other people."}</p>
    {(!locating || !requested) && <button type="button" className="btn btn-accent btn-lg mt-2" aria-busy={pending} disabled={pending} onClick={onRetry}>{pending ? "Trying again…" : requested ? "Try again" : "Enable location"}</button>}
    <Link href="/now" className="text-link"><ArrowLeft size={16}/> Back to Now</Link><Link href="/inbox" className="text-sm text-ink-6 underline underline-offset-4">Go to your Inbox</Link>
  </section>;
}
