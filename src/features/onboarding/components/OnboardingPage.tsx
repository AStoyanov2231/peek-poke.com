"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Camera, Check, Loader2, MapPin, ShieldCheck } from "lucide-react";
import {
  currentProfileResponseSchema,
  interestCatalogResponseSchema,
  onboardingCompleteResponseSchema,
  profileInterestCreateResponseSchema,
  profileInterestDeleteResponseSchema,
  profileInterestsResponseSchema,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_ONBOARDING_INTERESTS,
  MIN_INTERESTS_REQUIRED,
  isTemporaryUsername,
  type Activity,
  type AvailabilityUpsertRequest,
} from "@peekpoke/shared";
import { afterOnboardingPath } from "@/lib/onboarding-redirect";
import { fetchContract } from "@/lib/typed-api";
import { compressImage, createThumbnail } from "@/lib/image-compression";
import { updateOwnerProfile, uploadOwnerProfilePhoto } from "@/data/web-query";
import { saveAvailability } from "@/data/availability";
import { useNearbyPresence } from "@/features/map/useNearbyPresence";
import { AvailabilityEditor } from "@/features/now/components/AvailabilityEditor";
import { activities } from "@/features/now/activities";
import { BrandMark } from "@/components/ui/BrandMark";

async function loadOnboarding(signal: AbortSignal) {
  const [profile, catalog, interests] = await Promise.all([
    fetchContract("/api/profile", currentProfileResponseSchema, { signal }),
    fetchContract("/api/interests", interestCatalogResponseSchema, { signal }),
    fetchContract("/api/profile/interests", profileInterestsResponseSchema, { signal }),
  ]);
  if (!profile.profile) throw new Error("Your profile is not ready yet. Please try again.");
  return { profile: profile.profile, tags: catalog.tags, interests: interests.interests };
}

const stepNames = ["About you", "Interests", "Right now", "Nearby"];
const titles = ["A little introduction", "Find your kind of company", "What are you up for?", "Find people around you"];

export default function OnboardingPage() {
  const data = useQuery({ queryKey: ["web", "onboarding"], queryFn: ({ signal }) => loadOnboarding(signal), retry: 1 });
  return (
    <div className="onboarding-page">
      <header className="onboarding-brand"><BrandMark /><span>peek &amp; poke</span></header>
      {data.data ? <OnboardingSteps initial={data.data} /> : (
        <section className="onboarding-panel">
          <h1>{data.isError ? "Let’s try that again" : "Getting your introduction ready"}</h1>
          {data.isError ? <><p role="alert">{data.error.message}</p><button className="btn btn-accent btn-md" onClick={() => void data.refetch()}>Try again</button></> : <p role="status" className="flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Loading your profile and interests…</p>}
        </section>
      )}
    </div>
  );
}

// This component owns the small sequential flow and its server-acknowledged state.
// react-doctor-disable-next-line no-giant-component
function OnboardingSteps({ initial }: { initial: Awaited<ReturnType<typeof loadOnboarding>> }) {
  const router = useRouter();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.profile.display_name ?? "");
  const [username, setUsername] = useState(isTemporaryUsername(initial.profile.username) ? "" : initial.profile.username ?? "");
  const [selectedInterests, setSelectedInterests] = useState(() => new Set(initial.interests.map((interest) => interest.tag_id)));
  const [pending, setPending] = useState(false);
  const [interestPending, setInterestPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [photoPending, setPhotoPending] = useState(false);
  const [photoNotice, setPhotoNotice] = useState("");
  const [photoError, setPhotoError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const presence = useNearbyPresence(initial.profile.id);
  const busy = pending || photoPending || interestPending !== null;

  useEffect(() => { heading.current?.focus(); }, [step]);

  const goTo = (next: number) => { setError(""); setStep(next); };
  const reportError = (cause: unknown) => setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");

  async function saveIntroduction(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await updateOwnerProfile({ display_name: name });
      await fetchContract("/api/profile/username", currentProfileResponseSchema, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }),
      });
      goTo(1);
    } catch (cause) { reportError(cause); }
    finally { setPending(false); }
  }

  async function uploadPhoto(file: File) {
    setPhotoPending(true);
    setPhotoError("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose a photo smaller than 20 MB.");
      const [compressed, thumbnail] = await Promise.all([compressImage(file), createThumbnail(file)]);
      const body = new FormData();
      body.append("file", compressed);
      body.append("thumbnail", thumbnail);
      await uploadOwnerProfilePhoto(body);
      setPhotoNotice("Photo submitted for review. It will appear after approval.");
    } catch (cause) { setPhotoError(cause instanceof Error ? cause.message : "Photo upload failed. You can retry or add one later."); }
    finally { setPhotoPending(false); if (photoInput.current) photoInput.current.value = ""; }
  }

  async function toggleInterest(tagId: string) {
    if (busy) return;
    const removing = selectedInterests.has(tagId);
    if (!removing && selectedInterests.size >= MAX_ONBOARDING_INTERESTS) return;
    setInterestPending(tagId);
    setError("");
    try {
      if (removing) await fetchContract(`/api/profile/interests/${tagId}`, profileInterestDeleteResponseSchema, { method: "DELETE" });
      else await fetchContract("/api/profile/interests", profileInterestCreateResponseSchema, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tag_id: tagId }) });
      setSelectedInterests((previous) => { const next = new Set(previous); if (removing) next.delete(tagId); else next.add(tagId); return next; });
    } catch (cause) { reportError(cause); }
    finally { setInterestPending(null); }
  }

  async function saveIntent(request: AvailabilityUpsertRequest) {
    setPending(true);
    setError("");
    try { await saveAvailability(request); goTo(3); }
    catch (cause) { reportError(cause); }
    finally { setPending(false); }
  }

  async function finish(enableLocation: boolean) {
    setPending(true);
    setError("");
    try {
      if (enableLocation && !presence.isLocationFresh) {
        const result = await presence.requestLocationSync();
        if (result !== "success") {
          setError("Location wasn’t enabled. Try again, or choose Not now to continue with Plans and invitations.");
          return;
        }
      }
      await fetchContract("/api/profile/complete-onboarding", onboardingCompleteResponseSchema, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["web"] });
      const parameters = new URLSearchParams(window.location.search);
      const invite = parameters.get("invite");
      const destination = afterOnboardingPath(parameters.get("redirectTo") ?? (invite ? `/invite/${invite}` : "/now"));
      router.replace(destination);
      router.refresh();
    } catch (cause) { reportError(cause); }
    finally { setPending(false); }
  }

  const matchingTags = initial.tags.filter((tag) => tag.name.toLowerCase().includes(search.toLowerCase()));
  const categories = [...new Set(matchingTags.map((tag) => tag.category))];
  return (
    <section className="onboarding-panel">
      <ol className="onboarding-progress" aria-label="Your introduction">
        {stepNames.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} data-complete={step > index}><span>{step > index ? <Check size={13} /> : index + 1}</span><span>{label}</span></li>)}
      </ol>
      <p className="onboarding-eyebrow">Step {step + 1} of {stepNames.length}</p>
      <h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
      {step === 0 && <>
        <p>Give people a name to say hello to. You can add more to your profile later.</p>
        <div className="onboarding-photo">
          <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={() => photoInput.current?.click()}><Camera size={18} />{photoPending ? "Uploading…" : photoNotice ? "Choose another photo" : "Add a photo"}</button>
          <span className="text-xs text-ink-6">Optional. A clear photo helps people recognize you.</span>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Profile photo" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); }} />
        </div>
        {photoNotice && <p role="status" className="text-sm">{photoNotice}</p>}
        {photoError && <p role="alert" className="text-sm text-danger-500">{photoError}</p>}
        <form onSubmit={saveIntroduction} className="onboarding-form">
          <label>Your name<input className="input" autoComplete="given-name" maxLength={MAX_DISPLAY_NAME_LENGTH} value={name} disabled={busy} required onChange={(event) => setName(event.target.value)} /></label>
          <label>Username<input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={20} pattern="[a-z0-9_]+" title="3 to 20 lowercase letters, numbers, or underscores" value={username} disabled={busy} required onChange={(event) => setUsername(event.target.value.toLowerCase())} /></label>
          <span className="text-xs text-ink-6">Your username is public. Use 3 to 20 letters, numbers, or underscores.</span>
          <button type="submit" className="btn btn-accent btn-md mt-3" disabled={busy || !name.trim() || username.length < 3}>{pending ? "Saving…" : "Continue"}<ArrowRight size={18} /></button>
        </form>
      </>}
      {step === 1 && <>
        <p>Choose {MIN_INTERESTS_REQUIRED} to {MAX_ONBOARDING_INTERESTS} interests. Shared interests give a first conversation somewhere to start.</p>
        <label className="onboarding-search">Find an interest<input className="input" type="search" placeholder="Coffee, music, hiking…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <p className="text-sm font-semibold" role="status">{selectedInterests.size} selected{selectedInterests.size < MIN_INTERESTS_REQUIRED ? ` · choose ${MIN_INTERESTS_REQUIRED - selectedInterests.size} more` : " · ready to continue"}</p>
        <div className="onboarding-interests">
          {categories.map((category) => <fieldset key={category}><legend>{category}</legend><div className="flex flex-wrap gap-2">{matchingTags.filter((tag) => tag.category === category).map((tag) => <button key={tag.id} type="button" className="activity-chip" aria-pressed={selectedInterests.has(tag.id)} data-selected={selectedInterests.has(tag.id)} disabled={busy || (!selectedInterests.has(tag.id) && selectedInterests.size >= MAX_ONBOARDING_INTERESTS)} onClick={() => void toggleInterest(tag.id)}>{interestPending === tag.id ? <Loader2 size={16} className="animate-spin" /> : selectedInterests.has(tag.id) ? <Check size={16} /> : null}{tag.name}</button>)}</div></fieldset>)}
          {matchingTags.length === 0 && <p>No interests match that search. Try another word.</p>}
        </div>
        <div className="onboarding-actions"><button className="btn btn-ghost btn-md" disabled={busy} onClick={() => goTo(0)}><ArrowLeft size={17} />Back</button><button className="btn btn-accent btn-md" disabled={busy || selectedInterests.size < MIN_INTERESTS_REQUIRED} onClick={() => goTo(2)}>Continue<ArrowRight size={18} /></button></div>
      </>}
      {step === 2 && <>
        <p>Pick something you’d enjoy doing now. Your availability ends automatically, and you can change it any time.</p>
        <div className="activity-list" aria-label="Choose your activity">{activities.map(({ id, label, Icon }) => <button key={id} type="button" className="activity-chip" aria-pressed={activity === id} data-selected={activity === id} disabled={busy} onClick={() => { setActivity(id); setError(""); }}><Icon size={19} />{label}</button>)}</div>
        {activity && <AvailabilityEditor key={activity} activity={activity} pending={pending} onSave={(request) => void saveIntent(request)} onCancel={() => setActivity(null)} />}
        <p className="text-xs text-ink-6">Availability follows your discovery settings. You can continue without location and choose who can discover you in Me → Settings.</p>
        <div className="onboarding-actions"><button className="btn btn-ghost btn-md" disabled={busy} onClick={() => goTo(1)}><ArrowLeft size={17} />Back</button><button className="btn btn-ghost btn-md" disabled={busy} onClick={() => goTo(3)}>I’ll decide later</button></div>
      </>}
      {step === 3 && <>
        <p>Location helps you find people who are up for the same thing nearby.</p>
        <div className="onboarding-privacy"><ShieldCheck size={24} /><div><strong>Approximate distance. Your choice.</strong><p>Other people see an approximate area, never your exact location. You control who can discover you in Me → Settings.</p></div></div>
        <p>Without location, you can still connect through invitations, chat, and make Plans.</p>
        <div className="onboarding-form"><button type="button" className="btn btn-accent btn-md" disabled={busy} onClick={() => void finish(true)}><MapPin size={18} />{pending ? "Getting ready…" : presence.isLocationFresh ? "Continue to Peek & Poke" : "Enable location"}</button><button type="button" className="btn btn-ghost btn-md" disabled={busy} onClick={() => void finish(false)}>Not now</button></div>
        <button type="button" className="btn btn-ghost btn-sm mt-3" disabled={busy} onClick={() => goTo(2)}><ArrowLeft size={16} />Back</button>
      </>}
      {error && <p className="onboarding-error" role="alert">{error}</p>}
      <footer className="onboarding-footer">For adults 18+. Meet in public and look out for each other. <Link href="/safety">Meeting safely</Link></footer>
    </section>
  );
}
