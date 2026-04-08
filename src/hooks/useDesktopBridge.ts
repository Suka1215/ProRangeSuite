import { useCallback, useEffect, useMemo, useState } from "react";
import { isDesktopApp } from "../lib/desktop";

const DESKTOP_ENTITLEMENT_KEY = "spivot-desktop-offline-entitlement";
const DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:3000";

export interface BridgeRuntimeStatus {
  ok: boolean;
  ip: string;
  httpPort: number;
  shotPort: number;
  tmShots: number;
}

export interface DesktopOfflinePairingStatus {
  token: string;
  paired: boolean;
  deviceName: string | null;
  userId: string | null;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  pairedAt: string | null;
}

export interface DesktopOfflineEntitlement {
  deviceName: string | null;
  userId: string | null;
  premiumExpiresAt: string | null;
  grantedAt: string;
}

export type DesktopConnectorId = "gspro" | "infinite-tee";
export type DesktopConnectorState = "idle" | "establishing" | "connected" | "failed";

export interface DesktopConnectorStatus {
  id: DesktopConnectorId;
  name: string;
  status: DesktopConnectorState;
  detail: string;
  updatedAt: string;
  commandLabel: string;
  available: boolean;
}

interface OfflineStatusResponse {
  ok: boolean;
  pairing: DesktopOfflinePairingStatus;
}

interface ConnectorsStatusResponse {
  ok: boolean;
  connectors: DesktopConnectorStatus[];
}

interface ConnectConnectorSuccessResponse {
  ok: true;
  connector: DesktopConnectorStatus;
  connectors?: DesktopConnectorStatus[];
}

interface ConnectConnectorFailureResponse {
  ok: false;
  error?: string;
  connector?: DesktopConnectorStatus;
  connectors?: DesktopConnectorStatus[];
}

function readEntitlement() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DESKTOP_ENTITLEMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesktopOfflineEntitlement;
    return isEntitlementValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistEntitlement(pairing: DesktopOfflinePairingStatus) {
  if (typeof window === "undefined") return null;

  const entitlement: DesktopOfflineEntitlement = {
    deviceName: pairing.deviceName,
    userId: pairing.userId,
    premiumExpiresAt: pairing.premiumExpiresAt,
    grantedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(DESKTOP_ENTITLEMENT_KEY, JSON.stringify(entitlement));
  return entitlement;
}

function clearEntitlement() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DESKTOP_ENTITLEMENT_KEY);
}

function isEntitlementValid(entitlement: DesktopOfflineEntitlement | null) {
  if (!entitlement) return false;
  if (!entitlement.premiumExpiresAt) return true;
  return new Date(entitlement.premiumExpiresAt).getTime() > Date.now();
}

function isPairingPremium(pairing: DesktopOfflinePairingStatus | null) {
  if (!pairing?.paired || !pairing.isPremium) return false;
  if (!pairing.premiumExpiresAt) return true;
  return new Date(pairing.premiumExpiresAt).getTime() > Date.now();
}

function isPairingAuthenticated(pairing: DesktopOfflinePairingStatus | null) {
  return Boolean(pairing?.paired && pairing.userId);
}

function getBridgeBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  if (window.desktop?.bridgeBaseUrl) {
    return window.desktop.bridgeBaseUrl;
  }

  const queryBridgeUrl = new URLSearchParams(window.location.search).get("bridgeUrl");
  if (queryBridgeUrl) {
    return queryBridgeUrl;
  }

  if (/electron/i.test(window.navigator.userAgent) && window.location.port === "5173") {
    return DEFAULT_BRIDGE_BASE_URL;
  }

  return "";
}

function upsertConnector(
  current: DesktopConnectorStatus[],
  connector: DesktopConnectorStatus
) {
  const next = current.filter((item) => item.id !== connector.id);
  return [...next, connector];
}

export function useDesktopBridge() {
  const desktop = isDesktopApp();
  const [bridge, setBridge] = useState<BridgeRuntimeStatus | null>(null);
  const [pairing, setPairing] = useState<DesktopOfflinePairingStatus | null>(null);
  const [entitlement, setEntitlement] = useState<DesktopOfflineEntitlement | null>(() => readEntitlement());
  const [connectors, setConnectors] = useState<DesktopConnectorStatus[]>([]);
  const [loading, setLoading] = useState(desktop);
  const [error, setError] = useState<string | null>(null);
  const bridgeBaseUrl = useMemo(() => getBridgeBaseUrl(), [desktop]);

  const refresh = useCallback(async () => {
    if (!desktop) {
      setLoading(false);
      return;
    }

    try {
      const [bridgeResponse, offlineResponse, connectorsResponse] = await Promise.all([
        fetch(`${bridgeBaseUrl}/api/status`),
        fetch(`${bridgeBaseUrl}/api/offline/status`),
        fetch(`${bridgeBaseUrl}/api/connectors/status`),
      ]);

      if (!bridgeResponse.ok || !offlineResponse.ok || !connectorsResponse.ok) {
        throw new Error("The local bridge is unavailable.");
      }

      const bridgePayload = await bridgeResponse.json() as BridgeRuntimeStatus;
      const offlinePayload = await offlineResponse.json() as OfflineStatusResponse;
      const connectorsPayload = await connectorsResponse.json() as ConnectorsStatusResponse;

      setBridge(bridgePayload);
      setPairing(offlinePayload.pairing);
      setConnectors(connectorsPayload.connectors ?? []);

      if (isPairingPremium(offlinePayload.pairing)) {
        setEntitlement(persistEntitlement(offlinePayload.pairing));
      } else {
        const cached = readEntitlement();
        setEntitlement(cached);
        if (!cached) {
          clearEntitlement();
        }
      }

      setError(null);
    } catch (nextError) {
      const cached = readEntitlement();
      setEntitlement(cached);
      setError(nextError instanceof Error ? nextError.message : "The desktop bridge is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [bridgeBaseUrl, desktop]);

  useEffect(() => {
    if (!desktop) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    const load = async () => {
      if (!active) return;
      await refresh();
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [desktop, refresh]);

  const premiumAccess = useMemo(
    () => isPairingPremium(pairing) || isEntitlementValid(entitlement),
    [entitlement, pairing]
  );

  const bridgeAccess = useMemo(
    () => isPairingAuthenticated(pairing) || premiumAccess,
    [pairing, premiumAccess]
  );

  const pairingUrl = useMemo(() => {
    if (!bridge || !pairing?.token) return "";

    const params = new URLSearchParams({
      host: bridge.ip,
      httpPort: String(bridge.httpPort),
      shotPort: String(bridge.shotPort),
      token: pairing.token,
      mode: "offline-companion",
    });

    return `spivot://desktop-pair?${params.toString()}`;
  }, [bridge, pairing]);

  const manualCode = pairing?.token ? pairing.token.slice(0, 8).toUpperCase() : null;

  const clearOfflineAccess = useCallback(async () => {
    clearEntitlement();
    setEntitlement(null);

    if (!desktop) return;

    try {
      await fetch(`${bridgeBaseUrl}/api/offline/unpair`, { method: "POST" });
    } catch {
      // Best effort.
    } finally {
      await refresh();
    }
  }, [bridgeBaseUrl, desktop, refresh]);

  const connectConnector = useCallback(async (connectorId: DesktopConnectorId) => {
    if (!desktop) return;

    const response = await fetch(`${bridgeBaseUrl}/api/connectors/${connectorId}/connect`, {
      method: "POST",
    });

    const payload = await response.json() as ConnectConnectorSuccessResponse | ConnectConnectorFailureResponse;

    if (!response.ok || payload.ok === false) {
      if (payload.connector) {
        setConnectors((current) => upsertConnector(current, payload.connector!));
      }
      throw new Error(("error" in payload && payload.error) || "Failed to start connector.");
    }

    if (payload.connectors) {
      setConnectors(payload.connectors);
    } else {
      setConnectors((current) => upsertConnector(current, payload.connector));
    }

    await refresh();
  }, [bridgeBaseUrl, desktop, refresh]);

  return {
    isDesktop: desktop,
    bridge,
    pairing,
    entitlement,
    connectors,
    loading,
    error,
    bridgeAccess,
    premiumAccess,
    offlineAllowed: premiumAccess,
    pairingUrl,
    manualCode,
    connectConnector,
    refresh,
    clearOfflineAccess,
  };
}
