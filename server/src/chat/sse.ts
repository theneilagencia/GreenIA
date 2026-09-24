// Server-Sent Events sobre a resposta crua do Node.
import type { ServerResponse } from 'node:http';

export function openSse(raw: ServerResponse) {
  raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no', // proxies (nginx/ALB) não seguram o stream
  });
  return {
    send(event: string, data: unknown) {
      if (raw.writableEnded) return;
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() { if (!raw.writableEnded) raw.end(); },
  };
}
