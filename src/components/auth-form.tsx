"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeReturnPath } from "@/lib/trip-intent";

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-fields auth-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const fields = new FormData(event.currentTarget);
        const email = String(fields.get("email")).trim().toLowerCase();
        const password = String(fields.get("password"));
        try {
          const result =
            mode === "signup"
              ? await authClient.signUp.email({
                  email,
                  password,
                  name: String(fields.get("name")).trim(),
                })
              : await authClient.signIn.email({ email, password });
          if (result.error) {
            setError(
              result.error.status === 429
                ? "Too many attempts. Please wait a minute and try again."
                : mode === "login"
                  ? "Couldn’t sign in. Check your email and password, then try again."
                  : "Couldn’t create an account. Check your details or try signing in if you already have an account.",
            );
            setBusy(false);
            return;
          }
          window.location.assign(safeReturnPath(next));
        } catch {
          setError("We couldn’t reach the account service. Please try again.");
          setBusy(false);
        }
      }}
    >
      {mode === "signup" && (
        <label className="field">
          Your name
          <input
            name="name"
            autoComplete="name"
            required
            minLength={1}
            maxLength={100}
          />
        </label>
      )}
      <label className="field">
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </label>
      <label className="field">
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 12 : 1}
          maxLength={128}
        />
        {mode === "signup" && (
          <span>Use a unique password with at least 12 characters.</span>
        )}
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </button>
      <p className="inline-note">
        {mode === "signup" ? "Already have an account?" : "New to TravelRelay?"}{" "}
        <Link
          href={`/${mode === "signup" ? "login" : "signup"}?next=${encodeURIComponent(safeReturnPath(next))}`}
        >
          {mode === "signup" ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <p className="inline-note">
        Email verification and password reset aren’t connected yet. Use an email
        you control and keep your password securely.
      </p>
    </form>
  );
}
