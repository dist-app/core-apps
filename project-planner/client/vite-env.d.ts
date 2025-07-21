/// <reference types="vite/client" />

declare class WebSocketStream {
  constructor(url: string);
  opened: Promise<{
    extensions: string;
    protocol: string;
    readable: ReadableStream<string>;
    writable: WritableStream<string>;
  }>;
}
