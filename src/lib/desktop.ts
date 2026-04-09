export interface DesktopRuntimeInfo {
  isDesktop?: boolean;
  bridgeBaseUrl?: string | null;
  platform: string;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}

declare global {
  interface Window {
    desktop?: DesktopRuntimeInfo;
  }
}

function hasDesktopQueryFlag() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("desktop") === "1";
}

export function isDesktopApp() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.desktop?.isDesktop || window.desktop?.versions?.electron) {
    return true;
  }

  if (hasDesktopQueryFlag()) {
    return true;
  }

  return /electron/i.test(window.navigator.userAgent);
}
