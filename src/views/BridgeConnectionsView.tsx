import React, { useEffect, useMemo, useState } from "react";
import { toDataURL } from "qrcode";
import type {
  BridgeRuntimeStatus,
  DesktopConnectorId,
  DesktopConnectorStatus,
  DesktopOfflineEntitlement,
  DesktopOfflinePairingStatus,
} from "../hooks/useDesktopBridge";

interface BridgeConnectionsViewProps {
  bridge: BridgeRuntimeStatus | null;
  pairing: DesktopOfflinePairingStatus | null;
  entitlement: DesktopOfflineEntitlement | null;
  connectors: DesktopConnectorStatus[];
  loading: boolean;
  error: string | null;
  offlineAllowed: boolean;
  bridgeOnly?: boolean;
  pairingUrl: string;
  manualCode: string | null;
  onRefresh: () => void | Promise<void>;
  onClearOfflineAccess?: () => void | Promise<void>;
  onContinueOffline?: () => void;
  onOpenCloudLogin?: () => void;
  onConnectConnector: (connectorId: DesktopConnectorId) => void | Promise<void>;
  compact?: boolean;
}

interface ConnectorDefinition {
  id: DesktopConnectorId;
  vendor: string;
  title: string;
  subtitle: string;
  tags: string[];
  monogram: string;
  instructions: string[];
  instructionNote: string;
}

const CONNECTOR_DEFINITIONS: Record<DesktopConnectorId, ConnectorDefinition> = {
  gspro: {
    id: "gspro",
    vendor: "GSPro",
    title: "GSPro Connector",
    subtitle: "Launch the local GSPro bridge helper and hand off SPIVOT shot traffic into GSPro Open Connect.",
    tags: ["Local Bridge", "Simulator", "Open Connect"],
    monogram: "GS",
    instructions: [
      "Open GSPro on this desktop and make sure the Open Connect window is available before you connect.",
      "Click Connect to GSPro to start the configured Python bridge helper for this desktop install.",
      "While GSPro is opening or waiting, the connector stays in Establishing for up to 30 seconds.",
      "If GSPro accepts the bridge, the button turns SPIVOT green and the status flips to Connected.",
      "If GSPro never comes online, SPIVOT marks the connection as failed so you can retry cleanly.",
    ],
    instructionNote: "The desktop app can use a bundled gspro_bridge.py helper or the path set in GSPRO_BRIDGE_SCRIPT.",
  },
  "infinite-tee": {
    id: "infinite-tee",
    vendor: "Infinite Tee",
    title: "Infinite Tee Connector",
    subtitle: "Prepare a dedicated connector profile for Infinite Tee with the same streamlined one-click workflow.",
    tags: ["Connector Profile", "Third-Party App", "Coming Next"],
    monogram: "IT",
    instructions: [
      "Select Infinite Tee when you want to prep its bridge profile inside the desktop suite.",
      "The UI and action flow are ready, but the actual launch command still needs the Infinite Tee app details.",
      "Once that command or integration spec is available, this button can start and monitor the connector exactly like GSPro.",
      "Until then, keep using the host and port details from the bridge tools for manual setup if needed.",
    ],
    instructionNote: "Infinite Tee is scaffolded in the suite now, but it still needs its launch or socket spec for a real connect flow.",
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

function getConnectorActionLabel(connector: DesktopConnectorStatus) {
  if (connector.id === "gspro" && !connector.available) {
    return "Helper not configured";
  }

  switch (connector.status) {
    case "connected":
      return `Connected to ${connector.name}`;
    case "establishing":
      return "Establishing…";
    case "failed":
      return "Connection failed";
    default:
      return connector.commandLabel;
  }
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
        : "The local bridge is offline. Start the desktop bridge before connecting GSPro.",
      updatedAt: new Date().toISOString(),
      commandLabel: "Connect to GSPro",
      available: Boolean(bridge),
    };
  }

  return {
    id: connectorId,
    name: definition.vendor,
    status: "idle",
    detail: "Connector profile ready.",
    updatedAt: new Date().toISOString(),
    commandLabel: "Connect to Infinite Tee",
    available: true,
  };
}

export default function BridgeConnectionsView({
  bridge,
  pairing,
  entitlement,
  connectors,
  loading,
  error,
  offlineAllowed,
  bridgeOnly = false,
  pairingUrl,
  manualCode,
  onRefresh,
  onClearOfflineAccess,
  onContinueOffline,
  onOpenCloudLogin,
  onConnectConnector,
  compact = false,
}: BridgeConnectionsViewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [activeConnectorId, setActiveConnectorId] = useState<DesktopConnectorId | null>(null);

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

  const connectorMap = useMemo(() => {
    const map = new Map<DesktopConnectorId, DesktopConnectorStatus>();
    connectors.forEach((connector) => {
      map.set(connector.id, connector);
    });
    return map;
  }, [connectors]);

  const gsproConnector = connectorMap.get("gspro") ?? getConnectorFallback("gspro", bridge);
  const infiniteTeeConnector = connectorMap.get("infinite-tee") ?? getConnectorFallback("infinite-tee", bridge);
  const selectedConnectorId = activeConnectorId ?? "gspro";
  const selectedConnector =
    connectorMap.get(selectedConnectorId) ?? getConnectorFallback(selectedConnectorId, bridge);
  const selectedDefinition = CONNECTOR_DEFINITIONS[selectedConnectorId];

  if (compact) {
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

  const pairingState = formatPairingState(pairing, offlineAllowed, bridgeOnly);
  const selectedActionLabel = getConnectorActionLabel(selectedConnector);
  const selectedBadgeText = getConnectorBadgeText(selectedConnector);
  const selectedConnecting = selectedConnector.status === "establishing";
  const selectedConnected = selectedConnector.status === "connected";
  const selectedActionDisabled = selectedConnecting || (selectedConnector.id === "gspro" && !selectedConnector.available);

  return (
    <section className="pr-bridge pr-connector-workspace">
      <div className="pr-bridge-head pr-connector-head">
        <div>
          <span className="pr-bridge-eyebrow">Bridge Connectors</span>
          <h1>Launch and monitor third-party connectors</h1>
          <p>
            Pick a connector card, open its setup panel, and start the local bridge directly from SPIVOT Suite.
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

      {error && <div className="pr-bridge-error">{error}</div>}
      <div className="pr-connector-selector-shell">
        <div className="pr-connector-selector-grid">
        {[gsproConnector, infiniteTeeConnector].map((connector) => {
          const definition = CONNECTOR_DEFINITIONS[connector.id];
          const badgeText = getConnectorBadgeText(connector);
          const footerTitle = connector.id === "gspro" ? "Open Connect" : "Connector profile";
          const footerMeta =
            connector.id === "gspro" ? "Local bridge + simulator" : "Third-party app";

          return (
            <button
              key={connector.id}
              type="button"
              className="pr-connector-card"
              onClick={() => setActiveConnectorId(connector.id)}
            >
              <div className="pr-connector-card-top">
                <span className={`pr-connector-card-orb is-${connector.id}`}>{definition.monogram}</span>
                <span className={`pr-connector-card-badge is-${connector.status}`}>{badgeText}</span>
              </div>

              <div className="pr-connector-card-copy">
                <span className="pr-connector-card-vendor">{definition.vendor} connector</span>
                <strong>{definition.title}</strong>
                <p>{definition.subtitle}</p>
              </div>

              <div className="pr-connector-card-tags">
                {definition.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <div className="pr-connector-card-footer">
                <div className="pr-connector-card-footer-copy">
                  <strong>{footerTitle}</strong>
                  <span>{footerMeta}</span>
                </div>
                <span className="pr-connector-card-cta">Open setup</span>
              </div>
            </button>
          );
        })}
        </div>
      </div>

      {activeConnectorId && (
        <div className="pr-connector-detail-page">
          <div className="pr-connector-page-top">
            <button
              type="button"
              className="pr-secondary-pill"
              onClick={() => setActiveConnectorId(null)}
            >
              Back to connectors
            </button>
          </div>

          <div className="pr-connector-detail-grid">
            <article className="pr-connector-feature-card">
              <div className="pr-connector-feature-top">
                <span className="pr-connector-feature-kicker">{selectedDefinition.vendor}</span>
                <span className={`pr-connector-live-pill is-${selectedConnector.status}`}>{selectedBadgeText}</span>
              </div>

              <div className="pr-connector-feature-brand">
                <span className={`pr-connector-feature-orb is-${selectedConnector.id}`}>{selectedDefinition.monogram}</span>
                <div>
                  <h2>{selectedDefinition.title}</h2>
                  <p>{selectedDefinition.subtitle}</p>
                </div>
              </div>

              <div className="pr-connector-feature-tags">
                {selectedDefinition.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <div className="pr-connector-feature-meta">
                <div>
                  <span>Bridge host</span>
                  <strong>{bridge?.ip ?? "Waiting for bridge"}</strong>
                </div>
                <div>
                  <span>Port</span>
                  <strong>{selectedConnector.id === "gspro" ? "9210 → 921" : bridge?.shotPort ?? "9211"}</strong>
                </div>
              </div>

              <p className="pr-connector-feature-status">{selectedConnector.detail}</p>

              <button
                className={`pr-connector-connect-button ${selectedConnected ? "is-connected" : ""}`}
                disabled={selectedActionDisabled}
                onClick={() => void onConnectConnector(selectedConnector.id)}
              >
                {selectedActionLabel}
              </button>

              <div className="pr-connector-feature-footnote">
                {selectedConnector.id === "gspro"
                  ? `Pair code ${manualCode ?? "pending"} • ${pairingState}`
                  : "Infinite Tee uses the same bridge workspace once its launch spec is configured."}
              </div>
            </article>

            <article className="pr-connector-instruction-panel">
              <span className="pr-connector-panel-kicker">Setup instructions</span>
              <h3>{selectedDefinition.title}</h3>
              <ul className="pr-connector-instruction-list">
                {selectedDefinition.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
              <p className="pr-connector-instruction-note">{selectedDefinition.instructionNote}</p>

              {selectedConnector.id === "gspro" && (
                <div className="pr-connector-instruction-summary">
                  <div>
                    <span>GSPro helper</span>
                    <strong>{selectedConnector.available ? "Configured" : "Not configured"}</strong>
                  </div>
                  <div>
                    <span>Current state</span>
                    <strong>{selectedBadgeText}</strong>
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
