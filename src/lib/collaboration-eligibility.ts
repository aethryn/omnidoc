export function hasRealtimeCollaboration(document: {
  shares: readonly unknown[];
  collaborators: readonly unknown[];
}) {
  return document.shares.length > 0 || document.collaborators.length > 0;
}
