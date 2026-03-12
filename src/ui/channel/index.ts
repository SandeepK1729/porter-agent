import http from 'node:http';

type ChannelEvent = "ui-update" | `response-end-${string}`;

interface ChannelActions {
  /** Subscribe a client to the channel */
  subscribe(res: http.ServerResponse): void;
  /** Unsubscribe a client from the channel */
  unsubscribe(res: http.ServerResponse): void;

  /** Broadcast an event to all subscribed clients */
  broadcast(event: ChannelEvent, html: string | string[]): void;
}

class Channel implements ChannelActions {
  private clients: Set<http.ServerResponse>;

  /// Constructor
  constructor() {
    this.clients = new Set<http.ServerResponse>();
  }

  subscribe = (res: http.ServerResponse): void => {
    this.clients.add(res);
  };

  unsubscribe(res: http.ServerResponse): void {
    this.clients.delete(res);
  }

  broadcast = (event: ChannelEvent, html: string | string[]): void => {

    const payload = Array.isArray(html) ? html.join("\n") : html;

    for (const client of this.clients) {
      this.send(client, event, payload);
    }
  };

  /**
   * Write a single SSE message. Multi-line HTML is split into multiple
   * `data:` lines so no double-newline accidentally terminates the frame.
   */
  send = (client: http.ServerResponse, event: string, html: string): void => {

    const safe = html.trim().replace(/\n{2,}/g, "\n");

    const dataLines = safe
      .split("\n")
      .map((l) => `data: ${l}`)
      .join("\n");

    client.write(`event: ${event}\n${dataLines}\n\n`);
  };
}

export default Channel;
export type { ChannelEvent };
