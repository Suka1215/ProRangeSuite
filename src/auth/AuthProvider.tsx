import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth, firebaseProjectInfo } from "../lib/firebase";

interface AuthDebugInfo {
  action: string;
  authDomain: string;
  provider: string;
  code: string | null;
  email: string | null;
  message: string | null;
  origin: string;
  projectId: string;
  timestamp: string;
  url: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: unknown | null;
  authDebug: AuthDebugInfo | null;
  clearAuthError: () => void;
  signInWithEmail: (email: string, password: string, remember: boolean) => Promise<void>;
  signInWithGoogle: (remember: boolean) => Promise<void>;
  signInWithApple: (remember: boolean) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

const AUTH_DEBUG_STORAGE_KEY = "pr-auth-debug";

function shouldFallbackToRedirect(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String(error.code);
  return code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment";
}

async function applyPersistence(remember: boolean) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

function getWindowValue<T>(getter: () => T, fallback: T) {
  if (typeof window === "undefined") return fallback;
  return getter();
}

function readStoredDebugInfo() {
  if (typeof window === "undefined") return null;

  const serialized = window.sessionStorage.getItem(AUTH_DEBUG_STORAGE_KEY);
  if (!serialized) return null;

  try {
    return JSON.parse(serialized) as AuthDebugInfo;
  } catch {
    window.sessionStorage.removeItem(AUTH_DEBUG_STORAGE_KEY);
    return null;
  }
}

function getErrorEmail(error: unknown) {
  if (!error || typeof error !== "object" || !("customData" in error)) return null;

  const customData = (error as FirebaseError & { customData?: Record<string, unknown> }).customData;
  return typeof customData?.email === "string" ? customData.email : null;
}

function createDebugInfo(action: string, provider: string, error?: unknown): AuthDebugInfo {
  const firebaseError = error as FirebaseError | undefined;

  return {
    action,
    authDomain: firebaseProjectInfo.authDomain,
    provider,
    code: typeof firebaseError?.code === "string" ? firebaseError.code : null,
    email: getErrorEmail(error),
    message: typeof firebaseError?.message === "string"
      ? firebaseError.message
      : error instanceof Error
        ? error.message
        : null,
    origin: getWindowValue(() => window.location.origin, "unknown"),
    projectId: firebaseProjectInfo.projectId,
    timestamp: new Date().toISOString(),
    url: getWindowValue(() => window.location.href, "unknown"),
  };
}

function persistDebugInfo(info: AuthDebugInfo | null) {
  if (typeof window === "undefined") return;

  if (!info) {
    window.sessionStorage.removeItem(AUTH_DEBUG_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(AUTH_DEBUG_STORAGE_KEY, JSON.stringify(info));
}

async function signInWithProvider(
  provider: GoogleAuthProvider | OAuthProvider,
  remember: boolean,
  onDebug: (info: AuthDebugInfo | null) => void,
  onError: (error: unknown | null) => void,
) {
  onDebug(createDebugInfo("popup_start", provider.providerId));
  onError(null);

  try {
    await signInWithPopup(auth, provider);
    await applyPersistence(remember);
    onDebug(null);
  } catch (error) {
    if (shouldFallbackToRedirect(error)) {
      onDebug(createDebugInfo("popup_fallback_to_redirect", provider.providerId, error));

      try {
        await applyPersistence(remember);
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        onDebug(createDebugInfo("redirect_error", provider.providerId, redirectError));
        onError(redirectError);
        throw redirectError;
      }
    }

    onDebug(createDebugInfo("popup_error", provider.providerId, error));
    onError(error);
    throw error;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [redirectResolved, setRedirectResolved] = useState(false);
  const [authError, setAuthError] = useState<unknown | null>(null);
  const [authDebug, setAuthDebug] = useState<AuthDebugInfo | null>(() => readStoredDebugInfo());

  function updateDebug(info: AuthDebugInfo | null) {
    persistDebugInfo(info);
    setAuthDebug(info);

    if (!info) {
      return;
    }

    if (info.code) {
      console.error("[Auth]", info);
      return;
    }

    console.info("[Auth]", info);
  }

  function clearAuthDiagnostics() {
    setAuthError(null);
    updateDebug(null);
  }

  useEffect(() => {
    let active = true;

    updateDebug(readStoredDebugInfo());

    getRedirectResult(auth)
      .then((result) => {
        if (!active || !result) return;
        updateDebug(createDebugInfo("redirect_success", result.providerId ?? "redirect"));
      })
      .catch((error) => {
        if (active) {
          updateDebug(createDebugInfo("redirect_error", "redirect", error));
          setAuthError(error);
        }
      })
      .finally(() => {
        if (active) {
          setRedirectResolved(true);
        }
      });

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      if (nextUser) {
        clearAuthDiagnostics();
      }
      setAuthResolved(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loading = !authResolved || !redirectResolved;

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    authError,
    authDebug,
    clearAuthError() {
      clearAuthDiagnostics();
    },
    async signInWithEmail(email, password, remember) {
      updateDebug(createDebugInfo("email_start", "password"));
      await applyPersistence(remember);
      setAuthError(null);

      try {
        await signInWithEmailAndPassword(auth, email, password);
        updateDebug(null);
      } catch (error) {
        updateDebug(createDebugInfo("email_error", "password", error));
        setAuthError(error);
        throw error;
      }
    },
    async signInWithGoogle(remember) {
      await signInWithProvider(googleProvider, remember, updateDebug, setAuthError);
    },
    async signInWithApple(remember) {
      await signInWithProvider(appleProvider, remember, updateDebug, setAuthError);
    },
    async logOut() {
      clearAuthDiagnostics();
      await signOut(auth);
    },
  }), [authDebug, authError, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
