export const websocketLimits = {
  pendingHandshakes: 32,
  totalConnections: 100,
  connectionsPerUser: 10,
  connectionsPerDocument: 25,
  handshakesPerUserPerMinute: 30,
  messagesPerMinute: 600,
  bytesPerMinute: 20 * 1024 * 1024,
  setupTimeoutMs: 10_000,
  idleTimeoutMs: 6 * 60_000,
} as const;

export type SocketBudget = { windowStartedAt:number; messages:number; bytes:number };

export function consumeSocketBudget(current: SocketBudget, now: number, bytes: number) {
  const budget = now - current.windowStartedAt >= 60_000
    ? { windowStartedAt:now, messages:0, bytes:0 }
    : { ...current };
  budget.messages += 1;
  budget.bytes += bytes;
  return {
    budget,
    allowed:budget.messages <= websocketLimits.messagesPerMinute && budget.bytes <= websocketLimits.bytesPerMinute,
  };
}

export type AttemptWindow = { windowStartedAt:number; count:number };

export function consumeHandshakeAttempt(current: AttemptWindow | undefined, now: number) {
  const attempt = !current || now - current.windowStartedAt >= 60_000
    ? { windowStartedAt:now, count:1 }
    : { ...current, count:current.count + 1 };
  return { attempt, allowed:attempt.count <= websocketLimits.handshakesPerUserPerMinute };
}
