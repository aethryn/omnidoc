export const collaborationIdleMs = 5 * 60_000;
export const collaborationHiddenIdleMs = 60_000;
export const collaborationActivitySignalMs = 60_000;
export const collaborationPendingFlushRetryMs = 5_000;

export function collaborationPersistenceKey(documentId: string, yjsEpoch: number) {
  return `omnidoc:${documentId}:${yjsEpoch}`;
}
