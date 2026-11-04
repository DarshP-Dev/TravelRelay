"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
export function SignOut({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="sign-out">
      <button
        type="button"
        className="button button-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await authClient.signOut();
            if (result.error) throw new Error("Sign-out failed");
            try {
              for (const key of Object.keys(sessionStorage))
                if (key.startsWith(`travelrelay:unsaved:${userId}:`))
                  sessionStorage.removeItem(key);
            } catch {}
            router.replace("/");
            router.refresh();
          } catch {
            setError("Sign-out couldn’t be confirmed. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
