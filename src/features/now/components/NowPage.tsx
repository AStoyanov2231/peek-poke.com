"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Clock3,
  MapPin,
  Plus,
  Users,
  Radio,
  X,
  Check,
} from "lucide-react";
import { type Activity, type AvailablePerson } from "@peekpoke/shared";
import {
  fetchAvailability,
  saveAvailability,
  clearAvailability,
} from "@/data/availability";
import {
  bootstrapQueryOptions,
  plansQueryOptions,
  sharedGroupsQueryOptions,
  webQueryKeys,
} from "@/data/web-query";
import { fetchInviteLink } from "@/data/invites";
import { useProfile } from "@/stores/selectors";
import { useNearbyPresence } from "@/features/map/useNearbyPresence";
import { useAppStore } from "@/stores/appStore";
import { QrScanButton } from "@/features/map/components/QrScanButton";
import { PlanComposerDialog } from "@/features/plans/components/PlanComposerDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PokeDialog } from "@/features/social/components/PokeDialog";
import { activities, activityInfo, remainingAvailability } from "../activities";
import { activePeopleWithinRadius } from "../discovery-order";
import { conciseDiscoveryReasonLabels } from "../discovery-reasons";
import { AvailabilityEditor } from "./AvailabilityEditor";

const availabilityKey = ["web", "availability"] as const;

export function NowPage() {
  const router = useRouter();
  const client = useQueryClient();
  const profile = useProfile();
  const userId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const presence = useNearbyPresence(userId);
  const locationStatus = useAppStore((state) => state.locationStatus);
  const query = useQuery({
    queryKey: availabilityKey,
    queryFn: ({ signal }) => fetchAvailability({ discoveryContext: true, signal }),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });
  const plans = useQuery(plansQueryOptions);
  const circles = useQuery(sharedGroupsQueryOptions);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<Activity | null>(null);
  const [radius, setRadius] = useState(2);
  const [planOpen, setPlanOpen] = useState(false);
  const [pokePerson, setPokePerson] = useState<AvailablePerson | null>(null);
  const [notice, setNotice] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (presence.isLocationFresh)
      void client.invalidateQueries({ queryKey: availabilityKey });
  }, [client, presence.isLocationFresh]);
  const availability =
    query.data?.availability &&
    Date.parse(query.data.availability.expiresAt) > now
      ? query.data.availability
      : null;
  const available = useMemo(
    () => activePeopleWithinRadius(query.data?.people ?? [], radius, now),
    [query.data?.people, radius, now],
  );
  const mutation = useMutation({
    mutationFn: saveAvailability,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: availabilityKey });
      setSelected(null);
      setNotice("You’re on. Your availability will end automatically.");
    },
  });
  const clear = useMutation({
    mutationFn: clearAvailability,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: availabilityKey });
      setNotice("Availability ended. You’re in control.");
    },
  });
  const invite = useMutation({
    mutationFn: () => fetchInviteLink(),
    onSuccess: (data) => setInviteUrl(data.invite_url),
  });
  const name = profile?.display_name?.split(" ")[0] ?? "you";
  const upcomingPlans = (plans.data?.plans ?? [])
    .filter(
      (plan) => plan.status === "active" && Date.parse(plan.starts_at) > now,
    )
    .slice(0, 4);
  const friends = available.filter(
    (person) => person.relationship === "friend",
  );

  return (
    <div className="now-page">
      <header className="now-header">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-6">
          <span className="active-dot" /> A little possibility, nearby
        </div>
        <QrScanButton variant="inline" />
      </header>
      <section className="now-intent">
        <p className="now-greeting">
          Hey {name}, make a little room for real life.
        </p>
        <h1>
          What are you
          <br className="sm:hidden" /> up for?
        </h1>
        <p className="now-subtitle">
          An hour. A coffee. A good excuse to get out.
        </p>
        <div className="activity-list" aria-label="Choose your activity">
          {activities.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="activity-chip"
              data-selected={
                selected === id || (!selected && availability?.activity === id)
              }
              aria-pressed={
                selected === id || (!selected && availability?.activity === id)
              }
              onClick={() => {
                mutation.reset();
                setSelected(id);
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
        {selected && (
          <AvailabilityEditor
            activity={selected}
            pending={mutation.isPending}
            error={mutation.isError ? mutation.error.message : undefined}
            onSave={(request) => mutation.mutate(request)}
            onCancel={() => setSelected(null)}
          />
        )}
        {!selected && availability && (
          <div className="availability-live">
            <span className="active-dot" />
            <span>
              You’re up for{" "}
              <strong>
                {availability.customLabel ??
                  activityInfo(availability.activity).label.toLowerCase()}
              </strong>
              <span className="text-ink-6">
                {" "}
                · {remainingAvailability(availability.expiresAt, now)}
              </span>
            </span>
            <button
              className="iconbtn border-0 bg-transparent shadow-none"
              type="button"
              aria-label="End availability"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {clear.isError && (
          <p role="alert" className="mt-3 text-sm text-danger-500">
            {clear.error.message}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 text-xs text-success-600">
            {notice}
          </p>
        )}
      </section>
      {!presence.isLocationFresh && (
        <section className="now-location">
          <MapPin size={21} />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              Good plans start somewhere.
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-6">
              Enable location to find people nearby. Others see an approximate
              area, never your precise position.
            </p>
            {locationStatus === "denied" && (
              <p className="mt-2 text-xs text-ink-6">
                Location is blocked. Allow it in your browser’s site settings,
                then try again.
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={presence.isLocationSyncPending}
            onClick={presence.retryLocationSync}
          >
            {presence.isLocationSyncPending
              ? "Finding you…"
              : "Enable location"}
          </button>
        </section>
      )}
      <section aria-labelledby="active-people-title">
        <div className="now-section-heading">
          <div>
            <p className="eyebrow">Same idea. Good company.</p>
            <h2 id="active-people-title">
              People up for something{" "}
              <span className="text-ink-5">
                {available.length > 0 ? `(${available.length})` : ""}
              </span>
            </h2>
          </div>
          <label className="radius-filter">
            <MapPin size={14} />
            <span className="sr-only">Discovery radius</span>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              <option value={2}>Within 2 km</option>
              <option value={10}>Within 10 km</option>
              <option value={25}>Within 25 km</option>
            </select>
          </label>
        </div>
        {query.isLoading ? (
          <div aria-label="Loading people" className="people-grid">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-52 animate-pulse rounded-3xl bg-ink-2"
              />
            ))}
          </div>
        ) : query.isError ? (
          <div className="social-error" role="alert">
            <p className="font-semibold">Couldn’t load who’s around.</p>
            <p className="mt-1 text-sm text-ink-6">
              Please try again. Your saved availability hasn’t been changed.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-4"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </div>
        ) : available.length > 0 ? (
          <div className="people-grid">
            {available.map((person) => (
              <PersonCard
                key={person.profile.id}
                person={person}
                now={now}
                onPoke={() => setPokePerson(person)}
              />
            ))}
          </div>
        ) : (
          <div className="now-empty">
            <div className="empty-ripple">
              <Radio size={28} />
            </div>
            <h3>
              A quiet moment.
              <br />
              You could start something.
            </h3>
            <p>
              {presence.isLocationFresh
                ? `Nobody available within ${radius} km right now.`
                : "Find your people, or bring a friend along."}
              <br />
              One little invitation can change the afternoon.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {radius < 25 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => setRadius(radius === 2 ? 10 : 25)}
                >
                  Look a little further <ArrowRight size={16} />
                </button>
              )}
              <button
                type="button"
                className="btn btn-accent btn-md"
                onClick={() => setPlanOpen(true)}
              >
                Start a plan <Plus size={16} />
              </button>
            </div>
            <button
              type="button"
              className="text-link mt-3"
              disabled={invite.isPending}
              onClick={() => invite.mutate()}
            >
              {invite.isPending ? "Getting your link…" : "Bring a friend along"}
              <ArrowUpRight size={15} />
            </button>
          </div>
        )}
      </section>
      {friends.length > 0 && (
        <section className="friends-strip">
          <span className="activity-medallion">
            <Users size={20} />
          </span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">
              Familiar faces, free right now
            </h2>
            <p className="text-xs text-ink-6">
              {friends
                .map((p) => p.profile.display_name ?? p.profile.username)
                .slice(0, 3)
                .join(", ")}
              {friends.length > 3 ? ` + ${friends.length - 3} more` : ""}
            </p>
          </div>
          <Link href="/friends" className="text-link">
            Your people <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
      <section>
        <div className="now-section-heading">
          <div>
            <p className="eyebrow">Put something in the diary</p>
            <h2>Plans taking shape</h2>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => setPlanOpen(true)}
          >
            <Plus size={17} /> New plan
          </button>
        </div>
        {plans.isError ? (
          <div className="social-error">
            <p>Couldn’t load plans.</p>
            <button
              type="button"
              className="text-link"
              onClick={() => void plans.refetch()}
            >
              Try again
            </button>
          </div>
        ) : plans.isLoading ? (
          <div
            aria-label="Loading plans"
            className="h-28 animate-pulse rounded-3xl bg-ink-2"
          />
        ) : upcomingPlans.length ? (
          <div className="now-plan-list">
            {upcomingPlans.map((plan) => {
              const Icon = activityInfo(plan.activity).Icon;
              return (
                <Link
                  className="now-plan"
                  href={`/plans/${plan.id}`}
                  key={plan.id}
                >
                  <span className="activity-medallion">
                    <Icon size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary">
                      {new Date(plan.starts_at).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      ·{" "}
                      {new Date(plan.starts_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight">
                      {plan.title ?? plan.activity}
                    </h3>
                    <p className="mt-1 truncate text-xs text-ink-6">
                      {plan.place_text} · {plan.member_count} going
                    </p>
                  </div>
                  <ArrowUpRight size={20} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="now-plan-empty">
            <Clock3 size={23} />
            <div>
              <h3>No plans yet. Plenty of possibilities.</h3>
              <p>Pick a public place, choose a time, invite your people.</p>
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() => setPlanOpen(true)}
            >
              Make the first move <ArrowUpRight size={16} />
            </button>
          </div>
        )}
      </section>
      <section>
        <div className="now-section-heading">
          <div>
            <p className="eyebrow">Your kind of people</p>
            <h2>Your Circles</h2>
          </div>
          <Link href="/inbox?tab=chats" className="text-link">
            Inbox <ArrowUpRight size={17} />
          </Link>
        </div>
        {circles.isError ? (
          <div className="social-error">
            <p>Couldn’t load your Circles.</p>
            <button
              type="button"
              className="text-link"
              onClick={() => void circles.refetch()}
            >
              Try again
            </button>
          </div>
        ) : circles.data?.groups.length ? (
          <div className="circle-list">
            {circles.data.groups.slice(0, 4).map((group) => (
              <Link
                key={group.id}
                href={`/group/${group.id}`}
                className="circle-item"
              >
                <Users size={21} />
                <span className="flex-1 text-sm font-semibold">
                  {group.name === "Shared group" ? "Your Circle" : group.name}
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="now-circle-empty">
            <div>
              <h3>Your gym crew. Your coffee people.</h3>
              <p>Scan the same code to start a Circle together.</p>
            </div>
            <QrScanButton variant="inline" />
          </div>
        )}
      </section>
      <p className="now-footnote">
        <MapPin size={13} /> Nearby without broadcasting exactly where you are.{" "}
        <Link href="/profile">Your privacy settings</Link>
      </p>
      {invite.isError && (
        <p role="alert" className="text-sm text-danger-500">
          {invite.error.message}
        </p>
      )}
      <PlanComposerDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        onCreated={(id) => router.push(`/plans/${id}`)}
      />
      {pokePerson && (
        <PokeDialog
          recipient={pokePerson.profile}
          defaultActivity={pokePerson.availability.activity}
          defaultCustomLabel={pokePerson.availability.customLabel}
          onClose={() => setPokePerson(null)}
          onSent={() => {
            setPokePerson(null);
            setNotice("Poke sent. You’ll find the reply in your Inbox.");
            void client.invalidateQueries({ queryKey: webQueryKeys.pokes });
          }}
        />
      )}
      <Dialog
        open={Boolean(inviteUrl)}
        onOpenChange={(open) => {
          if (!open) setInviteUrl(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Good company starts with you.</DialogTitle>
            <DialogDescription>
              Send this invite to a friend. You choose where to share it.
            </DialogDescription>
          </DialogHeader>
          <input
            aria-label="Your invitation link"
            className="input w-full"
            readOnly
            value={inviteUrl ?? ""}
            onFocus={(event) => event.target.select()}
          />
          <CopyInvite url={inviteUrl} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PersonCard({
  person,
  now,
  onPoke,
}: {
  person: AvailablePerson;
  now: number;
  onPoke: () => void;
}) {
  const { profile, availability } = person;
  const activity = activityInfo(availability.activity);
  const Icon = activity.Icon;
  const name = profile.display_name ?? profile.username;
  const discoveryLabels = conciseDiscoveryReasonLabels(person.discoveryReasons);
  return (
    <article className="person-intent-card">
      <div className="flex items-center justify-between">
        <span className="activity-medallion">
          <Icon size={22} />
        </span>
        <span className="person-time">
          <span className="active-dot" />
          {remainingAvailability(availability.expiresAt, now)}
        </span>
      </div>
      <h3>{availability.customLabel ?? `${activity.label}?`}</h3>
      <Link href={`/profile/${profile.id}`} className="person-identity">
        <Avatar className="h-9 w-9">
          {profile.avatar_url && (
            <AvatarImage src={profile.avatar_url} alt={name} />
          )}
          <AvatarFallback name={name} />
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-xs text-ink-6">
            {person.distanceKm < 1
              ? "In your area"
              : `About ${Math.round(person.distanceKm)} km away`}
            {person.relationship === "friend" ? " · Friend" : ""}
          </p>
        </div>
      </Link>
      {person.sharedInterestNames.length || !discoveryLabels.length ? (
        <p className="person-common">
          {person.sharedInterestNames.length
            ? `You both like ${person.sharedInterestNames.slice(0, 3).join(", ")}`
            : person.relationship === "friend"
              ? "A familiar face. A fresh idea."
              : "A new face. A shared idea."}
        </p>
      ) : null}
      {discoveryLabels.length ? (
        <p className="text-xs font-medium text-ink-6">
          {discoveryLabels.join(" · ")}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-accent btn-md w-full"
        onClick={onPoke}
      >
        Poke: {availability.customLabel ?? activity.label}
        <ArrowUpRight size={16} />
      </button>
    </article>
  );
}

function CopyInvite({ url }: { url: string | null }) {
  const [state, setState] = useState("");
  return (
    <>
      <button
        type="button"
        className="btn btn-accent btn-md"
        onClick={async () => {
          if (!url) return;
          try {
            await navigator.clipboard.writeText(url);
            setState("Copied. Send it wherever you make plans.");
          } catch {
            setState("Select the link above and copy it to share.");
          }
        }}
      >
        <Check size={16} /> Copy invite link
      </button>
      <p role="status" className="text-xs text-ink-6">
        {state}
      </p>
    </>
  );
}
