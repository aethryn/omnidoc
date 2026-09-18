export const persistenceAckTimeoutMs = 20_000;
export const persistenceRetryBaseMs = 2_000;
export const persistenceRetryMaxMs = 30_000;

export type PersistCheckpoint = { description: string; title?: string; source?: string };

export type PersistMarker = {
  kind: "persist-request";
  markerId: string;
  clientId: string;
  sequence: number;
  checkpoint?: PersistCheckpoint;
};

export type PersistedMessage = {
  kind: "persisted";
  markerId?: string;
  sequence?: number;
  revision?: number;
  persistedAt?: string;
};

export type PersistFailedMessage = {
  kind: "persist-failed";
  markerId?: string;
  sequence?: number;
  code: "PERSISTENCE_FAILED" | "PERSISTENCE_TIMEOUT";
};

export function persistenceRetryDelay(attempt: number) {
  return Math.min(persistenceRetryMaxMs, persistenceRetryBaseMs * 2 ** Math.max(0, attempt));
}

export function isPersistedMessage(value: unknown): value is PersistedMessage {
  return Boolean(value && typeof value === "object" && (value as PersistedMessage).kind === "persisted");
}

export function isPersistFailedMessage(value: unknown): value is PersistFailedMessage {
  return Boolean(value && typeof value === "object" && (value as PersistFailedMessage).kind === "persist-failed");
}
