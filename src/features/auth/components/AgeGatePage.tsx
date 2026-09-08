"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  ageAdmissionRequestSchema,
  ageAdmissionSchema,
  type AgeAdmission,
} from "@peekpoke/shared";
import { signOut } from "@/features/auth/actions";
import { afterAgeAdmissionPath } from "@/lib/age-admission-redirect";
import { birthDateRequest, birthDateReview, type BirthDateFields } from "@/features/auth/age-admission-form";
import { fetchContract } from "@/lib/typed-api";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";

const blankFields: BirthDateFields = { day: "", month: "", year: "" };

async function loadAgeAdmission(signal?: AbortSignal) {
  return fetchContract("/api/age-admission", ageAdmissionSchema, { signal });
}

async function submitAgeAdmission(birthDate: string) {
  return fetchContract("/api/age-admission", ageAdmissionSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ageAdmissionRequestSchema.parse({ birth_date: birthDate })),
  });
}

function destination() {
  if (typeof window === "undefined") return "/now";
  return afterAgeAdmissionPath(new URLSearchParams(window.location.search).get("redirectTo"));
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("AGE_ADMISSION_UNAVAILABLE")
    ? "Age eligibility is temporarily unavailable. Please try again."
    : message || "We couldn’t save your eligibility decision. Please try again.";
}

function AccountExitActions({ router }: { router: ReturnType<typeof useRouter> }) {
  const [confirmAccountDelete, setConfirmAccountDelete] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    setAccountDeleteError("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      if (!response.ok) throw new Error("We couldn’t delete your account. Please try again.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setAccountDeleteError(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <>
      <form action={signOut} className="mt-6"><button type="submit" className="btn btn-secondary btn-md">Sign out</button></form>
      <div className="mt-5 border-t border-ink-2 pt-4 text-left">
        {!confirmAccountDelete ? <button type="button" className="text-sm font-semibold text-danger-500 underline underline-offset-4" onClick={() => setConfirmAccountDelete(true)}>Delete account</button> : <div className="space-y-3"><p className="text-sm leading-6 text-ink-7">Deleting your account is permanent. Do you want to continue?</p>{accountDeleteError ? <p role="alert" className="text-sm text-danger-500">{accountDeleteError}</p> : null}<div className="flex gap-2"><button type="button" className="btn btn-danger btn-sm" disabled={deleting} onClick={() => void deleteAccount()}>{deleting ? "Deleting…" : "Delete my account"}</button><button type="button" className="btn btn-ghost btn-sm" disabled={deleting} onClick={() => setConfirmAccountDelete(false)}>Cancel</button></div></div>}
      </div>
    </>
  );
}

export default function AgeGatePage() {
  const router = useRouter();
  const [admission, setAdmission] = useState<AgeAdmission | null>(null);
  const [loadingAdmission, setLoadingAdmission] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [fields, setFields] = useState<BirthDateFields>(blankFields);
  const [reviewing, setReviewing] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const review = useMemo(() => birthDateReview(fields), [fields]);

  function load(signal?: AbortSignal) {
    return loadAgeAdmission(signal).then((result) => {
      setAdmission(result);
      setLoadError("");
    }).catch((error) => {
      if (!signal?.aborted) setLoadError(errorMessage(error));
    }).finally(() => {
      if (!signal?.aborted) setLoadingAdmission(false);
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  function retryLoad() {
    setLoadingAdmission(true);
    setLoadError("");
    void load();
  }

  useEffect(() => {
    if (admission?.status === "adult") {
      router.replace(destination());
      router.refresh();
    }
  }, [admission?.status, router]);

  function updateField(field: keyof BirthDateFields, value: string) {
    setFields((current) => ({ ...current, [field]: value.replace(/\D/g, "") }));
    setFormError("");
    setSubmissionError("");
    setReviewing(false);
  }

  function beginReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!birthDateRequest(fields) || !review) {
      setFormError("Enter your day, month, and four-digit year of birth.");
      return;
    }
    setReviewing(true);
  }

  async function confirmAge() {
    const birthDate = birthDateRequest(fields);
    if (!birthDate) {
      setReviewing(false);
      setFormError("Enter your day, month, and four-digit year of birth.");
      return;
    }
    setSubmitting(true);
    setSubmissionError("");
    try {
      const result = await submitAgeAdmission(birthDate);
      // Raw DOB never enters a query cache and is discarded immediately once
      // the server returns an immutable eligibility decision.
      setFields(blankFields);
      setReviewing(false);
      setAdmission(result);
    } catch (error) {
      setSubmissionError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingAdmission && !admission) {
    return <section aria-busy="true" className="rounded-lg bg-background p-8 text-center shadow-e-2"><Loader2 aria-hidden="true" className="mx-auto animate-spin text-primary" size={24} /><p className="mt-3 text-sm text-ink-7">Checking eligibility…</p></section>;
  }

  if (loadError && !admission) {
    return <section className="rounded-lg bg-background p-8 text-center shadow-e-2"><h1 className="text-2xl font-bold text-foreground">Let’s try that again</h1><p role="alert" className="mt-2 text-sm text-ink-7">{loadError}</p><button type="button" className="btn btn-accent btn-md mt-5" onClick={retryLoad}>Try again</button><AccountExitActions router={router} /></section>;
  }

  if (admission?.status === "blocked") {
    return (
      <section className="rounded-lg bg-background p-8 text-center shadow-e-2">
        <ShieldCheck aria-hidden="true" className="mx-auto text-ink-7" size={30} />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Peek &amp; Poke is for adults</h1>
        <p className="mt-2 text-sm leading-6 text-ink-7">You can’t use the social app because this community is for people 18 and older.</p>
        <AccountExitActions router={router} />
        <p className="mt-5 text-xs text-ink-6"><Link href="/privacy" className="underline underline-offset-4">Privacy</Link> · <Link href="/terms" className="underline underline-offset-4">Terms</Link></p>
      </section>
    );
  }

  if (admission?.status === "adult") {
    return <section aria-busy="true" className="rounded-lg bg-background p-8 text-center shadow-e-2"><Loader2 aria-hidden="true" className="mx-auto animate-spin text-primary" size={24} /><p className="mt-3 text-sm text-ink-7">Continuing…</p></section>;
  }

  return (
    <section className="rounded-lg bg-background p-8 shadow-e-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">A quick check</p>
      <h1 className="mt-2 text-2xl font-bold text-foreground">Are you 18 or older?</h1>
      <p className="mt-2 text-sm leading-6 text-ink-7">Peek &amp; Poke is for adults. Enter your date of birth so we can decide whether you’re eligible.</p>
      {!reviewing ? (
        <form className="mt-6 space-y-5" onSubmit={beginReview}>
          <fieldset disabled={submitting}>
            <legend className="text-sm font-semibold text-ink-9">Date of birth</legend>
            <p id="birth-date-help" className="mt-1 text-xs text-ink-6">Use numbers only. We use this self-declaration only to decide eligibility. We do not keep your date of birth.</p>
            <div className="mt-3 grid grid-cols-[1fr_1fr_1.35fr] gap-2">
              <label className="min-w-0 text-xs font-medium text-ink-7">Day<Input aria-describedby="birth-date-help" aria-label="Day of birth" autoComplete="bday-day" className="mt-1 h-12 min-w-0 tabular-nums" inputMode="numeric" maxLength={2} value={fields.day} onChange={(event) => updateField("day", event.target.value)} /></label>
              <label className="min-w-0 text-xs font-medium text-ink-7">Month<Input aria-describedby="birth-date-help" aria-label="Month of birth" autoComplete="bday-month" className="mt-1 h-12 min-w-0 tabular-nums" inputMode="numeric" maxLength={2} value={fields.month} onChange={(event) => updateField("month", event.target.value)} /></label>
              <label className="min-w-0 text-xs font-medium text-ink-7">Year<Input aria-describedby="birth-date-help" aria-label="Year of birth" autoComplete="bday-year" className="mt-1 h-12 min-w-0 tabular-nums" inputMode="numeric" maxLength={4} value={fields.year} onChange={(event) => updateField("year", event.target.value)} /></label>
            </div>
          </fieldset>
          {formError || submissionError ? <p role="alert" className="text-sm text-danger-500">{formError || submissionError}</p> : null}
          <button type="submit" className="btn btn-accent btn-md w-full">Review date</button>
        </form>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="rounded-md bg-ink-1 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-6">Please check carefully</p><p className="mt-1 text-lg font-semibold text-ink-9">{review}</p><p className="mt-2 text-sm leading-6 text-ink-7">This self-declaration is final. We do not use it to verify your identity.</p></div>
          {submissionError ? <p role="alert" className="text-sm text-danger-500">{submissionError}</p> : null}
          <button type="button" className="btn btn-accent btn-md w-full" disabled={submitting} onClick={() => void confirmAge()}>{submitting ? "Checking…" : "Confirm and continue"}</button>
          <button type="button" className="btn btn-ghost btn-md w-full" disabled={submitting} onClick={() => setReviewing(false)}>Edit date</button>
        </div>
      )}
      <AccountExitActions router={router} />
    </section>
  );
}
