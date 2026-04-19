"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { AtSign, Lock, Loader2, AlertCircle, Mail } from "lucide-react";

import { login, signup, signInWithGoogle, signInWithApple } from "../actions";

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 25, stiffness: 200 } },
};

const headingVariants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

const shakeVariants = {
  shake: { x: [-10, 8, -6, 4, 0], transition: { duration: 0.4 } },
};

const oauthStagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const oauthItem = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const hoverTap = { whileHover: { scale: 1.02 }, whileTap: { scale: 0.97 } };

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const invite = searchParams.get("invite");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"apple" | "google" | null>(null);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError("");
    setSuggestion(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuggestion(null);

    const formData = new FormData(e.currentTarget);

    if (mode === "signin") {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else if (result?.emailNotConfirmed) {
        setEmailNotConfirmed(true);
        setLoading(false);
      }
    } else {
      const result = await signup(formData);
      if (result?.error) {
        setError(result.error);
        setSuggestion(result.suggestion || null);
        setLoading(false);
      } else if (result?.emailConfirmation) {
        setEmailSent(true);
        setLoading(false);
      }
    }
  }

  async function handleAppleSignIn() {
    setOauthLoading("apple");
    setError("");
    const result = await signInWithApple(invite ? `/invite/${invite}` : (redirectTo || undefined));
    if (result?.error) {
      setError(result.error);
      setOauthLoading(null);
    }
  }

  async function handleGoogleSignIn() {
    setOauthLoading("google");
    setError("");
    const result = await signInWithGoogle(invite ? `/invite/${invite}` : (redirectTo || undefined));
    if (result?.error) {
      setError(result.error);
      setOauthLoading(null);
    }
  }

  if (emailNotConfirmed) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md bg-background shadow-neu-raised rounded-lg p-8 text-center"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 shadow-neu-inset rounded-full mb-4">
          <Mail className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Confirm your email</h2>
        <p className="text-muted-foreground mb-6">
          Please check your inbox and click the confirmation link before logging in.
        </p>
        <motion.button
          {...hoverTap}
          onClick={() => setEmailNotConfirmed(false)}
          className="px-6 py-3 rounded-full bg-primary-gradient text-white font-semibold shadow-neu-raised-sm"
        >
          Try again
        </motion.button>
      </motion.div>
    );
  }

  if (emailSent) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md bg-background shadow-neu-raised rounded-lg p-8 text-center"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 shadow-neu-inset rounded-full mb-4">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Check your email</h2>
        <p className="text-muted-foreground mb-6">
          We sent a confirmation link to your email. Click it to complete signup.
        </p>
        <motion.button
          {...hoverTap}
          onClick={() => { setEmailSent(false); setMode("signin"); }}
          className="px-6 py-3 rounded-full bg-primary-gradient text-white font-semibold shadow-neu-raised-sm"
        >
          Back to Sign In
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-md bg-background shadow-neu-raised rounded-lg p-6 lg:p-8"
    >
      <AnimatePresence mode="wait">
        <motion.h1
          key={mode}
          variants={headingVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="text-2xl lg:text-3xl font-display font-bold text-foreground text-center mb-4"
        >
          {mode === "signin" ? "Sign in" : "Welcome"}
        </motion.h1>
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-3">
        <InputWithIcon
          name="email"
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<AtSign className="h-5 w-5" />}
        />
        <InputWithIcon
          name="password"
          type="password"
          placeholder="Password"
          required
          icon={<Lock className="h-5 w-5" />}
        />

        {error && (
          <motion.div variants={shakeVariants} animate="shake">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
                {suggestion && (
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto ml-1 text-primary underline"
                    onClick={() => { setEmail(suggestion); setError(""); setSuggestion(null); }}
                  >
                    Use this email
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <motion.div {...hoverTap}>
          <Button
            type="submit"
            variant="primary"
            className="w-full rounded-full font-semibold uppercase h-12 text-base"
            disabled={loading || oauthLoading !== null}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </motion.div>
      </form>

      <motion.div {...hoverTap} className="mt-2">
        <button
          type="button"
          onClick={toggleMode}
          className="w-full rounded-full bg-background shadow-neu-raised-sm text-primary font-semibold h-11 text-sm transition-all hover:shadow-neu-inset"
        >
          {mode === "signin" ? "Create Account" : "Sign In Instead"}
        </button>
      </motion.div>

      <div className="flex items-center my-4">
        <div className="flex-1 border-t border-border" />
        <span className="px-4 text-muted-foreground text-sm">or continue with</span>
        <div className="flex-1 border-t border-border" />
      </div>

      <motion.div variants={oauthStagger} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3">
        <motion.div variants={oauthItem} {...hoverTap}>
          <Button
            type="button"
            onClick={handleAppleSignIn}
            disabled={loading || oauthLoading !== null}
            variant="secondary"
            className="w-full rounded-full font-medium h-12"
          >
            {oauthLoading === "apple" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            )}
            Apple
          </Button>
        </motion.div>
        <motion.div variants={oauthItem} {...hoverTap}>
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || oauthLoading !== null}
            variant="secondary"
            className="w-full rounded-full font-medium h-12"
          >
            {oauthLoading === "google" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Google
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
