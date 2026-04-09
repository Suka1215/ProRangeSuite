import React from "react";
import { useAuth } from "./AuthProvider";
import { useDesktopBridge } from "../hooks/useDesktopBridge";
import { isDesktopApp } from "../lib/desktop";
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

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const desktopBridge = useDesktopBridge();
  const desktop = isDesktopApp();

  if (loading || (desktop && !user && desktopBridge.loading && !desktopBridge.bridgeAccess)) {
    return <AuthLoader />;
  }

  if (desktop && !user && desktopBridge.premiumAccess) {
    return <>{children}</>;
  }

  if (!user) {
    if (desktop) {
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
