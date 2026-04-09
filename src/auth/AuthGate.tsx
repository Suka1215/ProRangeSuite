import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useDesktopBridge } from "../hooks/useDesktopBridge";
import { isDesktopApp } from "../lib/desktop";
import { firebaseProjectInfo } from "../lib/firebase";
import BridgeConnectionsView from "../views/BridgeConnectionsView";
import LoginView from "../views/LoginView";

function AuthLoader() {
  return (
    <div className="pr-auth-shell">
      <div className="pr-auth-card is-loading">
        <span className="pr-loader-dot" />
        <strong>Checking your account…</strong>
      </div>
    </div>
  );
}

function useCloudAvailability(enabled: boolean) {
  const [cloudAvailable, setCloudAvailable] = useState(() => {
    if (!enabled || typeof window === "undefined") {
      return true;
    }

    return window.navigator.onLine;
  });
  const [cloudChecking, setCloudChecking] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCloudAvailable(true);
      setCloudChecking(false);
      return;
    }

    if (typeof window === "undefined") {
      setCloudAvailable(true);
      setCloudChecking(false);
      return;
    }

    let active = true;

    const probeCloud = async () => {
      if (!window.navigator.onLine) {
        if (!active) return;
        setCloudAvailable(false);
        setCloudChecking(false);
        return;
      }

      if (active) {
        setCloudChecking(true);
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3500);

      try {
        await fetch(`https://${firebaseProjectInfo.authDomain}/__/auth/handler?probe=${Date.now()}`, {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!active) return;
        setCloudAvailable(true);
      } catch (error) {
        if (!active) return;
        setCloudAvailable(false);
      } finally {
        window.clearTimeout(timeout);
        if (active) {
          setCloudChecking(false);
        }
      }
    };

    const handleOnline = () => {
      void probeCloud();
    };

    const handleOffline = () => {
      if (!active) return;
      setCloudAvailable(false);
      setCloudChecking(false);
    };

    void probeCloud();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled]);

  return { cloudAvailable, cloudChecking };
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const desktopBridge = useDesktopBridge();
  const desktop = isDesktopApp();
  const { cloudAvailable, cloudChecking } = useCloudAvailability(desktop && !user);

  if (loading || (desktop && !user && cloudChecking) || (desktop && !user && !cloudAvailable && desktopBridge.loading)) {
    return <AuthLoader />;
  }

  if (!user) {
    if (desktop && !cloudAvailable) {
      return (
        <BridgeConnectionsView
          bridge={desktopBridge.bridge}
          pairing={desktopBridge.pairing}
          entitlement={desktopBridge.entitlement}
          connectors={desktopBridge.connectors}
          connectorLogs={desktopBridge.connectorLogs}
          loading={desktopBridge.loading}
          error={desktopBridge.error}
          offlineAllowed={desktopBridge.premiumAccess}
          bridgeOnly={desktopBridge.bridgeAccess && !desktopBridge.premiumAccess}
          pairingUrl={desktopBridge.pairingUrl}
          manualCode={desktopBridge.manualCode}
          onConnectConnector={desktopBridge.connectConnector}
          onSendGsproTestShot={desktopBridge.sendGsproTestShot}
          onRefresh={desktopBridge.refresh}
          onClearOfflineAccess={desktopBridge.clearOfflineAccess}
          compact={!desktopBridge.bridgeAccess}
        />
      );
    }

    return <LoginView />;
  }

  return <>{children}</>;
}
