import { contextBridge } from "electron";

const bridgeUrlArg = process.argv.find((arg) => arg.startsWith("--bridge-url="));
const bridgeBaseUrl = bridgeUrlArg ? bridgeUrlArg.replace("--bridge-url=", "") : null;

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  bridgeBaseUrl,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
