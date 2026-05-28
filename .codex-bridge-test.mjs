import { startBridgeServer } from './server.js';
const bridge = await startBridgeServer({ httpPort: 3010, shotPort: 9311, silent: true, baseDir: process.cwd() });
console.log(`bridge:${bridge.httpPort}`);
setInterval(() => {}, 1000);
