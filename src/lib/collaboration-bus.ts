import IORedis, { type Redis } from "ioredis";

export type CollaborationBusMessage = {
  version: 1;
  id: string;
  sender: string;
  documentId: string;
  kind: "yjs-update" | "awareness";
  data: string;
};

export type CollaborationBusStatus = "disabled" | "connecting" | "ready" | "degraded";
type MessageHandler = (message: CollaborationBusMessage) => void;
type SessionRevocationHandler = (sessionId: string) => void;

const channelPrefix = "omnidoc:room:";
export const sessionRevocationChannel = "omnidoc:control:session-revoked";
const idleDisconnectMs = 30_000;

export function collaborationChannel(documentId: string) {
  return `${channelPrefix}${documentId}`;
}

function validRedisUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "redis:" || url.protocol === "rediss:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export class CollaborationBus {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private connectPromise: Promise<void> | null = null;
  private disconnectTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private readonly subscriptions = new Map<string, Set<MessageHandler>>();
  private readonly sessionRevocationHandlers = new Set<SessionRevocationHandler>();
  private _status: CollaborationBusStatus;

  constructor(private readonly url: string | undefined, private readonly required = false) {
    if (!url) {
      if (required) throw new Error("REDIS_URL is required when WS_REDIS_REQUIRED=true");
      this._status = "disabled";
      return;
    }
    if (!validRedisUrl(url)) throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL");
    this._status = "connecting";
  }

  get status() {
    return this._status;
  }

  get subscribedRooms() {
    return this.subscriptions.size;
  }

  private hasSubscriptions() {
    return this.subscriptions.size > 0 || this.sessionRevocationHandlers.size > 0;
  }

  async ensureConnected() {
    await this.connect();
    return this.status;
  }

  private markDegraded(error?: unknown) {
    this._status = "degraded";
    if (error) console.error("Redis collaboration bus unavailable", error instanceof Error ? error.message : error);
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (!this.hasSubscriptions() || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt++, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }

  private attachClientEvents(client: Redis, role: "publisher" | "subscriber") {
    client.on("ready", () => {
      if (this.publisher?.status === "ready" && this.subscriber?.status === "ready") {
        this._status = "ready";
        this.reconnectAttempt = 0;
        void this.resubscribeAll();
      }
    });
    client.on("error", (error) => this.markDegraded(error));
    client.on("close", () => {
      if (this.hasSubscriptions()) this.markDegraded(new Error(`Redis ${role} connection closed`));
    });
  }

  private async connect() {
    if (!this.url || this._status === "disabled") return;
    if (this.publisher?.status === "ready" && this.subscriber?.status === "ready") return;
    if (this.connectPromise) return this.connectPromise;
    if (this.publisher || this.subscriber) {
      const reconnecting = [this.publisher, this.subscriber].some((client) => client?.status === "connecting" || client?.status === "reconnecting");
      if (reconnecting) return;
      this.publisher?.disconnect();
      this.subscriber?.disconnect();
      this.publisher = null;
      this.subscriber = null;
    }
    this._status = "connecting";
    this.connectPromise = (async () => {
      const options = { lazyConnect: true, maxRetriesPerRequest: null, enableReadyCheck: true, retryStrategy: (attempt: number) => Math.min(5_000, 250 * 2 ** Math.min(attempt, 5)) };
      const publisher = new IORedis(this.url!, options);
      const subscriber = new IORedis(this.url!, options);
      this.publisher = publisher;
      this.subscriber = subscriber;
      this.attachClientEvents(publisher, "publisher");
      this.attachClientEvents(subscriber, "subscriber");
      subscriber.on("message", (channel, raw) => {
        if (channel === sessionRevocationChannel) {
          try {
            const message = JSON.parse(raw) as { sessionId?: unknown };
            const sessionId = message.sessionId;
            if (typeof sessionId === "string") this.sessionRevocationHandlers.forEach((handler) => handler(sessionId));
          } catch (error) {
            console.error("Invalid Redis session revocation message", error instanceof Error ? error.message : error);
          }
          return;
        }
        const handlers = this.subscriptions.get(channel);
        if (!handlers) return;
        try {
          const message = JSON.parse(raw) as CollaborationBusMessage;
          if (message.version !== 1 || typeof message.id !== "string" || typeof message.sender !== "string" || typeof message.documentId !== "string" || (message.kind !== "yjs-update" && message.kind !== "awareness") || typeof message.data !== "string") return;
          handlers.forEach((handler) => handler(message));
        } catch (error) {
          console.error("Invalid Redis collaboration message", error instanceof Error ? error.message : error);
        }
      });
      try {
        await Promise.all([publisher.connect(), subscriber.connect()]);
        this._status = "ready";
        this.reconnectAttempt = 0;
        await this.resubscribeAll();
      } catch (error) {
        this.markDegraded(error);
        publisher.disconnect();
        subscriber.disconnect();
        this.publisher = null;
        this.subscriber = null;
      } finally {
        this.connectPromise = null;
      }
    })();
    return this.connectPromise;
  }

  private async resubscribeAll() {
    if (!this.subscriber || this.subscriber.status !== "ready") return;
    for (const channel of this.subscriptions.keys()) {
      await this.subscriber.subscribe(channel).catch((error) => this.markDegraded(error));
    }
    if (this.sessionRevocationHandlers.size) {
      await this.subscriber.subscribe(sessionRevocationChannel).catch((error) => this.markDegraded(error));
    }
  }

  async subscribe(documentId: string, handler: MessageHandler) {
    if (!this.url || this._status === "disabled") return async () => {};
    const channel = collaborationChannel(documentId);
    let handlers = this.subscriptions.get(channel);
    if (!handlers) {
      handlers = new Set<MessageHandler>();
      this.subscriptions.set(channel, handlers);
    }
    handlers.add(handler);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    await this.connect();
    if (this.subscriber?.status === "ready") await this.subscriber.subscribe(channel).catch((error) => this.markDegraded(error));

    return async () => {
      const current = this.subscriptions.get(channel);
      if (!current) return;
      current.delete(handler);
      if (current.size) return;
      this.subscriptions.delete(channel);
      if (this.subscriber?.status === "ready") await this.subscriber.unsubscribe(channel).catch((error) => this.markDegraded(error));
      if (!this.hasSubscriptions()) {
        this.disconnectTimer = setTimeout(() => this.disconnectIfIdle(), idleDisconnectMs);
        this.disconnectTimer.unref();
      }
    };
  }

  async subscribeSessionRevocations(handler: SessionRevocationHandler) {
    if (!this.url || this._status === "disabled") return async () => {};
    this.sessionRevocationHandlers.add(handler);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    await this.connect();
    if (this.subscriber?.status === "ready") {
      await this.subscriber.subscribe(sessionRevocationChannel).catch((error) => this.markDegraded(error));
    }

    return async () => {
      this.sessionRevocationHandlers.delete(handler);
      if (!this.hasSubscriptions() && this.subscriber?.status === "ready") {
        await this.subscriber.unsubscribe(sessionRevocationChannel).catch((error) => this.markDegraded(error));
        this.disconnectTimer = setTimeout(() => this.disconnectIfIdle(), idleDisconnectMs);
        this.disconnectTimer.unref();
      }
    };
  }

  async publish(message: CollaborationBusMessage) {
    if (!this.url || this._status === "disabled") return false;
    await this.connect();
    if (!this.publisher || this.publisher.status !== "ready") return false;
    try {
      await this.publisher.publish(collaborationChannel(message.documentId), JSON.stringify(message));
      return true;
    } catch (error) {
      this.markDegraded(error);
      return false;
    }
  }

  private disconnectIfIdle() {
    if (this.hasSubscriptions()) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
    this.publisher = null;
    this.subscriber = null;
    this._status = this.url ? "connecting" : "disabled";
    this.disconnectTimer = null;
  }

  async close() {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.disconnectTimer = null;
    this.reconnectTimer = null;
    this.subscriptions.clear();
    this.sessionRevocationHandlers.clear();
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
    this.publisher = null;
    this.subscriber = null;
    this._status = this.url ? "connecting" : "disabled";
  }
}
