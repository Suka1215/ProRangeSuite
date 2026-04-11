import React, { useEffect, useMemo, useState } from "react";
import { toDataURL } from "qrcode";
import type {
  BridgeRuntimeStatus,
  ConnectorLogEntry,
  DesktopConnectorId,
  DesktopConnectorStatus,
  DesktopOfflineEntitlement,
  DesktopOfflinePairingStatus,
} from "../hooks/useDesktopBridge";
import { isDesktopApp } from "../lib/desktop";

const LOCAL_CONNECTOR_HOST = "127.0.0.1:3000";
const DEFAULT_CONNECTOR_DOWNLOAD_URL = "https://github.com/Suka1215/ProRangeSuite/releases/latest";
const CONNECTOR_DOWNLOAD_URL =
  import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL?.trim() || DEFAULT_CONNECTOR_DOWNLOAD_URL;

interface BridgeConnectionsViewProps {
  bridge: BridgeRuntimeStatus | null;
  pairing: DesktopOfflinePairingStatus | null;
  entitlement: DesktopOfflineEntitlement | null;
  connectors: DesktopConnectorStatus[];
  connectorLogs: Record<DesktopConnectorId, ConnectorLogEntry[]>;
  loading: boolean;
  error: string | null;
  offlineAllowed: boolean;
  bridgeOnly?: boolean;
  pairingUrl: string;
  gsproScanUrl?: string;
  manualCode: string | null;
  onRefresh: () => void | Promise<void>;
  onClearOfflineAccess?: () => void | Promise<void>;
  onContinueOffline?: () => void;
  onOpenCloudLogin?: () => void;
  onConnectConnector: (connectorId: DesktopConnectorId) => void | Promise<void>;
  onDisconnectConnector?: (connectorId: DesktopConnectorId) => void | Promise<void>;
  onSendGsproTestShot?: () => Promise<unknown>;
  compact?: boolean;
}

interface ConnectorDefinition {
  id: DesktopConnectorId;
  vendor: string;
  title: string;
  subtitle: string;
  tags: string[];
  monogram: string;
}

const CONNECTOR_DEFINITIONS: Record<DesktopConnectorId, ConnectorDefinition> = {
  gspro: {
    id: "gspro",
    vendor: "GSPro",
    title: "GSPro Connector",
    subtitle: "Launch the local GSPro bridge helper and hand off SPIVOT shot traffic into GSPro Open Connect.",
    tags: ["Local Bridge", "Simulator", "Open Connect"],
    monogram: "GS",
  },
  "infinite-tee": {
    id: "infinite-tee",
    vendor: "Infinite Tee",
    title: "Infinite Tee Connector",
    subtitle: "Prepare a dedicated connector profile for Infinite Tee with the same streamlined one-click workflow.",
    tags: ["Connector Profile", "Third-Party App", "Coming Next"],
    monogram: "IT",
  },
};

function formatPairingState(
  pairing: DesktopOfflinePairingStatus | null,
  offlineAllowed: boolean,
  bridgeOnly: boolean
) {
  if (pairing?.paired && pairing.isPremium) return "Premium unlocked";
  if (offlineAllowed) return "Saved premium access";
  if (bridgeOnly || pairing?.paired) return "Bridge only access";
  return "Waiting for app pair";
}

function getConnectorBadgeText(connector: DesktopConnectorStatus) {
  if (connector.id === "gspro" && !connector.available) {
    return "Setup needed";
  }

  switch (connector.status) {
    case "connected":
      return "Connected";
    case "establishing":
      return "Establishing";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}

function getConnectorFallback(
  connectorId: DesktopConnectorId,
  bridge: BridgeRuntimeStatus | null
): DesktopConnectorStatus {
  const definition = CONNECTOR_DEFINITIONS[connectorId];

  if (connectorId === "gspro") {
    return {
      id: "gspro",
      name: "GSPro",
      status: bridge ? "idle" : "failed",
      detail: bridge
        ? "Ready to start the GSPro bridge."
        : "The local connector is offline. Start the Connector app before connecting GSPro.",
      updatedAt: new Date().toISOString(),
      commandLabel: "Connect to GSPro",
      available: Boolean(bridge),
    };
  }

  return {
    id: connectorId,
    name: definition.vendor,
    status: bridge ? "idle" : "failed",
    detail: bridge
      ? "Connector profile ready."
      : "The local connector is offline. Start the Connector app before preparing this profile.",
    updatedAt: new Date().toISOString(),
    commandLabel: "Connect to Infinite Tee",
    available: Boolean(bridge),
  };
}

export default function BridgeConnectionsView({
  bridge,
  pairing,
  entitlement,
  connectors,
  connectorLogs,
  loading,
  error,
  offlineAllowed,
  bridgeOnly = false,
  pairingUrl,
  gsproScanUrl = "",
  manualCode,
  onRefresh,
  onClearOfflineAccess,
  onContinueOffline,
  onOpenCloudLogin,
  onConnectConnector,
  onDisconnectConnector,
  onSendGsproTestShot,
  compact = false,
}: BridgeConnectionsViewProps) {
  const desktopRuntime = isDesktopApp();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [gsproQrDataUrl, setGsproQrDataUrl] = useState<string>("");
  const [sendingTestShot, setSendingTestShot] = useState(false);

  useEffect(() => {
    let active = true;

    if (!pairingUrl) {
      setQrDataUrl("");
      return;
    }

    void toDataURL(pairingUrl, {
      width: 280,
      margin: 1,
      color: {
        dark: "#262930",
        light: "#ffffff",
      },
    })
      .then((nextUrl) => {
        if (active) setQrDataUrl(nextUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [pairingUrl]);

  useEffect(() => {
    let active = true;

    if (!gsproScanUrl) {
      setGsproQrDataUrl("");
      return;
    }

    void toDataURL(gsproScanUrl, {
      width: 240,
      margin: 1,
      color: {
        dark: "#262930",
        light: "#ffffff",
      },
    })
      .then((nextUrl) => {
        if (active) setGsproQrDataUrl(nextUrl);
      })
      .catch(() => {
        if (active) setGsproQrDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [gsproScanUrl]);

  const connectorMap = useMemo(() => {
    const map = new Map<DesktopConnectorId, DesktopConnectorStatus>();
    connectors.forEach((connector) => {
      map.set(connector.id, connector);
    });
    return map;
  }, [connectors]);

  const gsproConnector = connectorMap.get("gspro") ?? getConnectorFallback("gspro", bridge);
  const infiniteTeeConnector = connectorMap.get("infinite-tee") ?? getConnectorFallback("infinite-tee", bridge);
  const bridgeAvailable = Boolean(bridge);
  const browserConnectorMissing = !desktopRuntime && !loading && !bridgeAvailable;
  const downloadConnectorEnabled = Boolean(CONNECTOR_DOWNLOAD_URL);
  const pairingState = formatPairingState(pairing, offlineAllowed, bridgeOnly);
  const pairedDevice = pairing?.deviceName || entitlement?.deviceName || null;
  const compactStatus = offlineAllowed
    ? `Premium paired with ${pairedDevice || "your app"}`
    : bridgeOnly || pairing?.paired
      ? "Bridge paired. Premium is required to unlock the full suite."
      : loading
        ? "Preparing pairing QR..."
        : error
          ? "Bridge unavailable"
          : "Waiting for app pair";
  const gsproConnected = gsproConnector.status === "connected";
  const gsproConnecting = gsproConnector.status === "establishing";
  const gsproOrbPulsing = gsproConnecting || gsproConnected;
  const gsproLogs = connectorLogs.gspro ?? [];
  const showGsproQr = Boolean(gsproQrDataUrl);
  const gsproStatusLabel = gsproConnected ? "Connected" : gsproConnecting ? "Connecting" : "Waiting";

  if (compact) {
    return (
      <div className="pr-auth-shell pr-bridge-entry-shell">
        <div className="pr-bridge-entry-frame">
          <div className="pr-auth-card pr-bridge-entry-card is-qr">
            <div className="pr-auth-grid" />
            <div className="pr-bridge-entry-header">
              <img
                src="/spivot-logo.svg"
                alt="SPIVOT"
                className="pr-auth-logo pr-bridge-entry-logo"
                draggable={false}
              />
              <div className="pr-bridge-entry-copy">
                <span className="pr-bridge-entry-kicker">Desktop Companion</span>
                <p className="pr-bridge-entry-subtitle">
                  Open the SPIVOT app, scan this code, and pair the desktop in one step.
                </p>
              </div>
            </div>

            <div className="pr-bridge-entry-hero">
              <div className="pr-bridge-entry-hero-shell">
                <div className="pr-bridge-entry-qr-shell">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Desktop pairing QR code"
                      className="pr-bridge-entry-qr"
                      draggable={false}
                    />
                  ) : (
                    <div className="pr-bridge-entry-qr is-placeholder">
                      {loading ? "Preparing QR..." : "QR unavailable"}
                    </div>
                  )}
                </div>
              </div>

              <div className="pr-bridge-entry-status" aria-live="polite">
                {compactStatus}
              </div>

              <div className="pr-bridge-actions">
                <button className="pr-secondary-pill" onClick={() => void onRefresh()}>
                  Refresh
                </button>
                {onClearOfflineAccess && (
                  <button className="pr-secondary-pill" onClick={() => void onClearOfflineAccess()}>
                    Reset Pairing
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="pr-bridge pr-connector-workspace">
      <div className="pr-bridge-head pr-connector-head">
        <div>
          <span className="pr-bridge-eyebrow">Bridge Connectors</span>
          <h1>Connect GSPro with one phone scan</h1>
          <p>
            The GSPro card now carries the scan flow directly. Scan once to start the connector workflow, hand shots to
            your phone, and keep Open Connect fed from SPIVOT.
          </p>
        </div>

        <div className="pr-connector-head-actions">
          <button className="pr-secondary-pill" onClick={() => void onRefresh()}>
            Refresh
          </button>
          {onOpenCloudLogin && (
            <button className="pr-secondary-pill" onClick={onOpenCloudLogin}>
              Cloud Sign In
            </button>
          )}
        </div>
      </div>

      {error && !browserConnectorMissing && <div className="pr-bridge-error">{error}</div>}
      {browserConnectorMissing && (
        <div className="pr-connector-browser-card">
          <div className="pr-connector-browser-copy">
            <span className="pr-connector-panel-kicker">Local Connector Needed</span>
            <h2>Start the SPIVOT Connector on this machine</h2>
            <p>
              {error ?? "The local connector is unavailable on http://127.0.0.1:3000."} Launch the Connector app on
              this computer, then refresh this page. Once it is running, your phone can scan the QR shown here to pair
              shots into GSPro.
            </p>
          </div>

          <div className="pr-connector-browser-meta">
            <div>
              <span>Expected host</span>
              <strong>{LOCAL_CONNECTOR_HOST}</strong>
            </div>
            <div>
              <span>Pairing flow</span>
              <strong>Scan the QR from the GSPro card</strong>
            </div>
          </div>

          <div className="pr-connector-browser-actions">
            <button className="pr-secondary-pill" onClick={() => void onRefresh()}>
              Retry localhost
            </button>
            {downloadConnectorEnabled && (
              <a
                className="pr-secondary-pill pr-connector-download-pill"
                href={CONNECTOR_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                Download Connector
              </a>
            )}
          </div>
        </div>
      )}

      <div className="pr-connector-selector-shell">
        <div className="pr-connector-selector-grid">
          <article className="pr-connector-card is-gspro-live">
            <div className="pr-connector-card-top">
              <span className={`pr-connector-card-orb is-gspro ${gsproOrbPulsing ? "is-pulsing" : ""}`}>GS</span>
              <span className={`pr-connector-card-badge is-${gsproConnector.status}`}>
                {getConnectorBadgeText(gsproConnector)}
              </span>
            </div>

            <div className="pr-connector-card-copy">
              <span className="pr-connector-card-vendor">GSPro connector</span>
              <strong>{CONNECTOR_DEFINITIONS.gspro.title}</strong>
              <p>{CONNECTOR_DEFINITIONS.gspro.subtitle}</p>
            </div>

            <div className="pr-connector-card-tags">
              {CONNECTOR_DEFINITIONS.gspro.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <div className="pr-connector-card-divider" />

            <div className="pr-connector-card-inline">
              <div className="pr-connector-feature-meta pr-connector-card-meta">
                <div>
                  <span>Bridge host</span>
                  <strong>{bridge?.ip ?? "Waiting for bridge"}</strong>
                </div>
                <div>
                  <span>Port</span>
                  <strong>9210 to 921</strong>
                </div>
              </div>

              <div className="pr-connector-card-qr-column">
                <div className="pr-connector-card-qr-copy">
                  <span className="pr-connector-panel-kicker">Phone scan</span>
                  <strong className="pr-connector-card-qr-headline">
                    Scan to launch the connector, connect to GSPro, and send the session to your phone.
                  </strong>
                </div>

                <div className="pr-bridge-showcase-qr-shell pr-connector-card-qr-shell">
                  {showGsproQr ? (
                    <img
                      src={gsproQrDataUrl}
                      alt="GSPro bridge QR code"
                      className="pr-bridge-showcase-qr pr-connector-card-qr"
                      draggable={false}
                    />
                  ) : (
                    <div className="pr-bridge-showcase-qr is-placeholder">
                      {loading ? "Preparing QR..." : "QR unavailable"}
                    </div>
                  )}
                </div>

              </div>

              {gsproConnected && onSendGsproTestShot && (
                <button
                  className="pr-secondary-pill"
                  disabled={sendingTestShot}
                  onClick={() => {
                    setSendingTestShot(true);
                    void onSendGsproTestShot().finally(() => setSendingTestShot(false));
                  }}
                >
                  {sendingTestShot ? "Sending test shot..." : "Send test shot"}
                </button>
              )}
            </div>

            <div className="pr-connector-card-footer">
              <div className="pr-connector-card-footer-copy">
                <strong>Phone scan ready</strong>
                <span>Scan once to launch bridge plus phone handoff</span>
              </div>
              <button
                className={`pr-connector-connect-button pr-connector-footer-button ${gsproConnected ? "is-connected" : ""}`}
                disabled
                onClick={() => void onConnectConnector("gspro")}
              >
                {gsproStatusLabel}
              </button>
            </div>

            <button
              className="pr-secondary-pill pr-connector-disconnect-pill"
              disabled={!onDisconnectConnector || (!gsproConnected && !gsproConnecting)}
              onClick={() => void onDisconnectConnector?.("gspro")}
            >
              Disconnect
            </button>
          </article>

          <article className="pr-connector-card">
            <div className="pr-connector-card-top">
              <span className="pr-connector-card-orb is-infinite-tee">{CONNECTOR_DEFINITIONS["infinite-tee"].monogram}</span>
              <span className={`pr-connector-card-badge is-${infiniteTeeConnector.status}`}>
                {getConnectorBadgeText(infiniteTeeConnector)}
              </span>
            </div>

            <div className="pr-connector-card-copy">
              <span className="pr-connector-card-vendor">Infinite Tee connector</span>
              <strong>{CONNECTOR_DEFINITIONS["infinite-tee"].title}</strong>
              <p>{CONNECTOR_DEFINITIONS["infinite-tee"].subtitle}</p>
            </div>

            <div className="pr-connector-card-tags">
              {CONNECTOR_DEFINITIONS["infinite-tee"].tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <div className="pr-connector-card-footer">
              <div className="pr-connector-card-footer-copy">
                <strong>Connector profile</strong>
                <span>Third-party app</span>
              </div>
              <span className="pr-connector-card-cta">Coming soon</span>
            </div>
          </article>
        </div>
      </div>

      <div className="pr-connector-detail-page">
        <div className="pr-connector-detail-grid is-single">
          <article className="pr-connector-instruction-panel">
            <span className="pr-connector-panel-kicker">GSPro logs</span>
            <h3>Connector activity</h3>
            <div className="pr-connector-log-list">
              {gsproLogs.length ? (
                gsproLogs.slice().reverse().map((entry) => (
                  <div key={entry.id} className={`pr-connector-log-entry is-${entry.level}`}>
                    <strong>{new Date(entry.createdAt).toLocaleTimeString()}</strong>
                    <span>{entry.message}</span>
                  </div>
                ))
              ) : (
                <div className="pr-connector-log-entry">
                  <span>No GSPro logs yet.</span>
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
