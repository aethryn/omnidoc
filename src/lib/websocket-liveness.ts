export const websocketHeartbeatIntervalMs = 30_000;
export const websocketHeartbeatMissLimit = 2;

export function shouldTerminateHeartbeat(missedPongs: number) {
  return missedPongs >= websocketHeartbeatMissLimit;
}

export function nextHeartbeatMissCount(missedPongs: number) {
  return missedPongs + 1;
}

export function resetHeartbeat() {
  return 0;
}
