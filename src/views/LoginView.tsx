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
  const { authDebug, authError, clearAuthError, signInWithApple, signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState<null | "apple" | "google" | "email">(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!authError) return;
    setError(authErrorMessage(authError));
  }, [authError]);

  async function runSignIn(kind: "apple" | "google" | "email") {
    setSubmitting(kind);
    setError(null);
    clearAuthError();

    try {
      if (kind === "apple") {
        await signInWithApple(remember);
        return;
      }

      if (kind === "google") {
        await signInWithGoogle(remember);
        return;
      }

      await signInWithEmail(email.trim(), password, remember);
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
          <p>Sign in with the same Apple, Google, or email account you use in the app.</p>
        </div>

        <div className="pr-auth-provider-row">
          <button
            className="pr-auth-provider"
            disabled={submitting !== null}
            onClick={() => void runSignIn("apple")}
          >
            <span className="pr-auth-provider-icon is-apple">A</span>
            <span>{submitting === "apple" ? "Connecting…" : "Apple"}</span>
          </button>

          <button
            className="pr-auth-provider"
            disabled={submitting !== null}
            onClick={() => void runSignIn("google")}
          >
            <span className="pr-auth-provider-icon is-google">G</span>
            <span>{submitting === "google" ? "Connecting…" : "Google"}</span>
          </button>
        </div>

        <div className="pr-auth-divider">
          <span>or</span>
        </div>

        <form
          className="pr-auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void runSignIn("email");
          }}
        >
          <label className="pr-auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting !== null}
            />
          </label>

          <label className="pr-auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting !== null}
            />
          </label>

          <label className="pr-auth-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={submitting !== null}
            />
            <span>Keep me signed in</span>
          </label>

          {error && <div className="pr-auth-error">{error}</div>}

          {authDebug && (
            <details className="pr-auth-debug" open>
              <summary>Auth debug details</summary>
              <p>Paste this back if Apple still fails. The browser console also logs the same snapshot.</p>
              <pre>{JSON.stringify(authDebug, null, 2)}</pre>
            </details>
          )}

          <button
            className="pr-auth-submit"
            type="submit"
            disabled={submitting !== null || !email.trim() || !password}
          >
            {submitting === "email" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="pr-auth-footnote">
          Account creation, password changes, and recovery stay in the app.
        </div>
      </div>
    </div>
  );
}
