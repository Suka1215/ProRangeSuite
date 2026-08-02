import React, { useState } from "react";
import type { FirebaseError } from "firebase/app";
import { useAuth } from "../auth/AuthProvider";

function authErrorMessage(error: unknown) {
  const code = (error as FirebaseError | undefined)?.code;

  switch (code) {
    case "auth/unauthorized-domain":
      return "This web domain is not authorized in Firebase Auth yet.";
    case "auth/operation-not-allowed":
      return "That sign-in method is not enabled in Firebase Auth yet.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/invalid-email":
    case "auth/user-not-found":
      return "Those credentials don't match an account in the app.";
    case "auth/internal-error":
      return "Apple sign-in returned an internal auth error. Check the Apple provider setup in Firebase and Apple Developer.";
    case "auth/account-exists-with-different-credential":
      return "Use the same sign-in method you used in the app.";
    case "auth/popup-closed-by-user":
      return "The sign-in window closed before authentication finished.";
    case "auth/cancelled-popup-request":
      return "Another sign-in popup interrupted the request. Try again.";
    case "auth/popup-blocked":
      return "The browser blocked the sign-in popup.";
    case "auth/network-request-failed":
      return "We couldn't reach Firebase. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Give it a moment and try again.";
    default:
      return "We couldn't sign you in. Use the same account you use in the app.";
  }
}

export default function LoginView({ onBack }: { onBack?: () => void } = {}) {
  const { authError, clearAuthError, signInWithApple, signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState<null | "apple" | "google">(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!authError) return;
    setError(authErrorMessage(authError));
  }, [authError]);

  async function runSignIn(kind: "apple" | "google") {
    setSubmitting(kind);
    setError(null);
    clearAuthError();

    try {
      if (kind === "apple") {
        await signInWithApple(true);
        return;
      }

      await signInWithGoogle(true);
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="pr-auth-shell">
      <div className="pr-auth-card">
        {onBack && (
          <button className="pr-auth-back" onClick={onBack} type="button">
            Back
          </button>
        )}
        <div className="pr-auth-grid" aria-hidden="true" />
        <img src="/spivot-logo.svg" alt="SPIVOT" className="pr-auth-logo" draggable={false} />

        <div className="pr-auth-copy">
          <h1>Welcome back</h1>
          <p>Sign in with the same Apple or Google account you use in the app.</p>
        </div>

        <div className="pr-auth-provider-row">
          <button
            className="pr-auth-provider"
            disabled={submitting !== null}
            onClick={() => void runSignIn("apple")}
          >
            <span className="pr-auth-provider-icon is-apple">A</span>
            <span>{submitting === "apple" ? "Connecting..." : "Apple"}</span>
          </button>

          <button
            className="pr-auth-provider"
            disabled={submitting !== null}
            onClick={() => void runSignIn("google")}
          >
            <span className="pr-auth-provider-icon is-google">G</span>
            <span>{submitting === "google" ? "Connecting..." : "Google"}</span>
          </button>
        </div>

        {error && <div className="pr-auth-error">{error}</div>}

        <div className="pr-auth-footnote">
          Account creation, password changes, and recovery stay in the app.
        </div>
      </div>
    </div>
  );
}
