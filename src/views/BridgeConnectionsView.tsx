import React, { useEffect, useState } from "react";
import { toDataURL } from "qrcode";
import type {
  BridgeRuntimeStatus,
  DesktopOfflineEntitlement,
  DesktopOfflinePairingStatus,
} from "../hooks/useDesktopBridge";

interface BridgeConnectionsViewProps {
  bridge: BridgeRuntimeStatus | null;
  pairing: DesktopOfflinePairingStatus | null;
  entitlement: DesktopOfflineEntitlement | null;
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
  compact?: boolean;
}

function formatExpiry(value: string | null) {
  if (!value) return "No expiry provided";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No expiry provided";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

export default function BridgeConnectionsView({
  bridge,
  pairing,
  entitlement,
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
  compact = false,
}: BridgeConnectionsViewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

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
              <img src="/spivot-logo.svg" alt="SPIVOT" className="pr-auth-logo pr-bridge-entry-logo" draggable={false} />
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

  const pairedDevice = pairing?.deviceName || entitlement?.deviceName || "No device paired";
  const pairedUser = pairing?.userId || entitlement?.userId || "Waiting for app";
  const pairingState = formatPairingState(pairing, offlineAllowed, bridgeOnly);
  const premiumSummary = offlineAllowed
    ? `Unlocked until ${formatExpiry(pairing?.premiumExpiresAt ?? entitlement?.premiumExpiresAt ?? null)}`
    : bridgeOnly || pairing?.paired
      ? "Bridge access is ready. Premium unlocks the rest of the suite."
      : "Scan with the SPIVOT app to validate the user and desktop pair.";
  const accessSummary = offlineAllowed
    ? "The full suite is unlocked on this desktop."
    : bridgeOnly || pairing?.paired
      ? "This desktop can connect to GSPro and bridge tools only."
      : "One scan shares the host, dashboard port, GSPro shot port, and secure pairing token.";
  const bridgeSummary = bridge
    ? `GSPro can point to ${bridge.ip} on port ${bridge.shotPort}.`
    : loading
      ? "Starting the local bridge and preparing the QR payload."
      : "Bridge is offline until the local receiver starts.";
  const tmSummary = bridge
    ? `${bridge.tmShots.toLocaleString()} TrackMan reference shots are cached for local matching.`
    : "Reference matching is unavailable until the bridge comes online.";

  return (
    <section className="pr-bridge pr-bridge-showcase">
      <div className="pr-bridge-head pr-bridge-showcase-head">
        <div>
          <span className="pr-bridge-eyebrow">Bridge Connections</span>
          <h1>Connect GSPro and pair the SPIVOT app</h1>
          <p>
            Use one QR code to hand the app everything it needs for local dashboard pairing and third-party bridge
            connections.
          </p>
        </div>
      </div>

      {error && <div className="pr-bridge-error">{error}</div>}
      {bridgeOnly && (
        <div className="pr-bridge-access-note">
          This account can use <strong>bridge connections only</strong>. Upgrade to premium in the app to unlock the
          rest of SPIVOT Suite.
        </div>
      )}

      <div className="pr-bridge-showcase-frame">
        <div className="pr-bridge-showcase-stage">
          <div className="pr-bridge-showcase-rail">
            <article className="pr-bridge-showcase-card">
              <span className="pr-bridge-showcase-label">GSPro Bridge</span>
              <strong>{bridge ? "Bridge live" : loading ? "Bridge starting" : "Bridge offline"}</strong>
              <p>{bridgeSummary}</p>
              <div className="pr-bridge-showcase-metrics">
                <div>
                  <span>Host</span>
                  <strong>{bridge?.ip ?? "—"}</strong>
                </div>
                <div>
                  <span>Port</span>
                  <strong>{bridge?.shotPort ?? "9211"}</strong>
                </div>
              </div>
            </article>

            <article className="pr-bridge-showcase-card is-soft">
              <span className="pr-bridge-showcase-label">Desktop Access</span>
              <strong>{offlineAllowed ? "Full suite unlocked" : bridgeOnly || pairing?.paired ? "Bridge only" : "Awaiting scan"}</strong>
              <p>{accessSummary}</p>
              <div className="pr-bridge-showcase-footnote">{manualCode ? `Pair code ${manualCode}` : "Pair code pending"}</div>
            </article>
          </div>

          <div className="pr-bridge-showcase-center">
            <div className="pr-bridge-showcase-hero">
              <div className="pr-bridge-showcase-qr-shell">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Offline pairing QR code" className="pr-bridge-showcase-qr" draggable={false} />
                ) : (
                  <div className="pr-bridge-showcase-qr is-placeholder">{loading ? "Preparing QR..." : "QR unavailable"}</div>
                )}
              </div>
            </div>

            <h2 className="pr-bridge-showcase-title">Scan in the SPIVOT app</h2>
            <p className="pr-bridge-showcase-subtitle">
              The app reads the desktop host, dashboard port, GSPro receiver, and secure pairing token directly from
              this QR code.
            </p>

            <div className={`pr-bridge-showcase-status ${offlineAllowed ? "is-live" : bridgeOnly || pairing?.paired ? "is-bridge" : "is-waiting"}`}>
              {pairingState}
            </div>

            <div className="pr-bridge-showcase-meter" aria-hidden="true">
              {Array.from({ length: 20 }).map((_, index) => (
                <span key={index} className={index < (offlineAllowed ? 20 : bridgeOnly || pairing?.paired ? 13 : 8) ? "is-active" : ""} />
              ))}
            </div>
          </div>

          <div className="pr-bridge-showcase-rail">
            <article className="pr-bridge-showcase-card is-compact">
              <span className="pr-bridge-showcase-label">Pairing</span>
              <strong>{pairedDevice}</strong>
              <p>{pairedUser}</p>
            </article>

            <article className="pr-bridge-showcase-card">
              <span className="pr-bridge-showcase-label">Premium + Matching</span>
              <strong>{bridge ? `${bridge.tmShots.toLocaleString()} refs` : "Waiting for bridge"}</strong>
              <p>{tmSummary}</p>
              <div className="pr-bridge-showcase-footnote">{premiumSummary}</div>
            </article>
          </div>
        </div>

        <div className="pr-bridge-showcase-actions">
          <button className="pr-secondary-pill" onClick={() => void onRefresh()}>
            Refresh
          </button>
          {onContinueOffline && (
            <button className="pr-primary-pill" disabled={!offlineAllowed} onClick={onContinueOffline}>
              Continue Offline
            </button>
          )}
          {onOpenCloudLogin && (
            <button className="pr-secondary-pill" onClick={onOpenCloudLogin}>
              Cloud Sign In
            </button>
          )}
          {onClearOfflineAccess && (
            <button className="pr-secondary-pill" onClick={() => void onClearOfflineAccess()}>
              Reset Pairing
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
