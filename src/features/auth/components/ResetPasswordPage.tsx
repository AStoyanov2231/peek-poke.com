"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("This recovery session is invalid or has expired. Request a new link.");
        return;
      }
      await supabase.auth.signOut();
      router.replace("/login?passwordUpdated=1");
      router.refresh();
    } catch {
      setError("We could not update your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-lg bg-background p-6 shadow-e-2 lg:p-8">
        <h1 className="text-center font-display text-2xl font-bold text-foreground">Set a new password</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Use at least {MIN_PASSWORD_LENGTH} characters and do not reuse a password from another service.
        </p>
        <form className="mt-6 space-y-3" onSubmit={submit}>
          <InputWithIcon
            autoComplete="new-password"
            icon={<Lock className="h-5 w-5" />}
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            required
            type="password"
            value={password}
          />
          <InputWithIcon
            autoComplete="new-password"
            icon={<Lock className="h-5 w-5" />}
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Confirm new password"
            required
            type="password"
            value={confirmation}
          />
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button className="h-12 w-full rounded-full" disabled={loading} type="submit" variant="primary">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Update Password"}
          </Button>
        </form>
      </section>
    </main>
  );
}
