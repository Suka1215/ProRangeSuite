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

export function isDesktopApp() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.desktop?.isDesktop || window.desktop?.versions?.electron) {
    return true;
  }

  return /electron/i.test(window.navigator.userAgent);
}
