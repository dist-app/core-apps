import { DDPClient } from "./ddp/ddp-client.ts";
// import { DDPClient } from "@dist-app/stdlib/ddp/client";


// import simpleDDP from 'simpleddp';
// let opts = {
//   endpoint: "wss://task-spinner.dist.app/websocket",
//   SocketConstructor: WebSocket,
//   reconnectInterval: 5000,
// };
// console.log('module running')
export const server = await DDPClient.connectToUrl('ws'+new URL('/websocket', window.location.href).toString().slice(4), 'raw');
// server.subscribe('meteor_autoupdate_clientVersions', []);
