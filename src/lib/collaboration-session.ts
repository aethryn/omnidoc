import type { Redis } from "ioredis";

export const collaborationHeartbeatMs = 5_000;
export const collaborationPresenceTtlMs = 12_000;

export type CollaborationSessionMode = "local" | "activating" | "realtime" | "demoting";
export type CollaborationSessionStatus = {
  mode: CollaborationSessionMode;
  participants: number;
  leaderId: string | null;
};

const keyPrefix = "omnidoc:collaboration";

export function collaborationPresenceKey(documentId: string) {
  return `${keyPrefix}:presence:${documentId}`;
}

export function collaborationStateKey(documentId: string) {
  return `${keyPrefix}:state:${documentId}`;
}

// One script owns membership pruning and transitions that depend on membership.
// Keeping this atomic prevents a second tab from racing a promotion or demotion.
export const collaborationPresenceScript = `
local presence = KEYS[1]
local state = KEYS[2]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local sessionId = ARGV[3]
local action = ARGV[4]

redis.call('ZREMRANGEBYSCORE', presence, '-inf', now - ttl)
if action == 'leave' then
  redis.call('ZREM', presence, sessionId)
else
  redis.call('ZADD', presence, now, sessionId)
end

local members = redis.call('ZRANGE', presence, 0, -1)
local count = #members
if count == 0 then
  redis.call('DEL', presence)
end
local mode = redis.call('HGET', state, 'mode') or 'local'
local leader = redis.call('HGET', state, 'leader')

if count >= 2 and mode == 'local' then
  mode = 'activating'
  leader = members[1]
  redis.call('HMSET', state, 'mode', mode, 'leader', leader)
elseif count >= 2 and mode == 'demoting' then
  mode = 'realtime'
  redis.call('HSET', state, 'mode', mode)
elseif count < 2 and mode == 'realtime' then
  mode = 'demoting'
  redis.call('HSET', state, 'mode', mode)
elseif count < 2 and mode == 'activating' then
  mode = 'local'
  leader = nil
  redis.call('DEL', state)
end

if count > 0 then
  redis.call('PEXPIRE', presence, ttl * 2)
end
if redis.call('EXISTS', state) == 1 then
  redis.call('PEXPIRE', state, ttl * 4)
end
return { mode, tostring(count), leader or '' }
`;

const promoteScript = `
local presence = KEYS[1]
local state = KEYS[2]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local sessionId = ARGV[3]
redis.call('ZREMRANGEBYSCORE', presence, '-inf', now - ttl)
local count = redis.call('ZCARD', presence)
local mode = redis.call('HGET', state, 'mode') or 'local'
local leader = redis.call('HGET', state, 'leader') or ''
if count < 2 or mode ~= 'activating' or leader ~= sessionId then
  return { '0', mode, tostring(count), leader }
end
redis.call('HSET', state, 'mode', 'realtime')
redis.call('PEXPIRE', state, ttl * 4)
return { '1', 'realtime', tostring(count), leader }
`;

const demoteScript = `
local presence = KEYS[1]
local state = KEYS[2]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', presence, '-inf', now - ttl)
local count = redis.call('ZCARD', presence)
local mode = redis.call('HGET', state, 'mode') or 'local'
if count >= 2 then
  redis.call('HSET', state, 'mode', 'realtime')
  redis.call('PEXPIRE', state, ttl * 4)
  return { '0', 'realtime', tostring(count) }
end
if mode ~= 'demoting' and mode ~= 'realtime' then
  return { '0', mode, tostring(count) }
end
redis.call('DEL', state)
return { '1', 'local', tostring(count) }
`;

function asStatus(raw: unknown): CollaborationSessionStatus {
  const [mode, participants, leaderId] = raw as [string, string, string];
  if (!["local", "activating", "realtime", "demoting"].includes(mode)) throw new Error("Invalid collaboration session state");
  return { mode: mode as CollaborationSessionMode, participants: Number(participants), leaderId: leaderId || null };
}

export async function touchCollaborationSession(redis: Redis, documentId: string, sessionId: string, action: "heartbeat" | "leave" = "heartbeat") {
  const raw = await redis.eval(
    collaborationPresenceScript,
    2,
    collaborationPresenceKey(documentId),
    collaborationStateKey(documentId),
    Date.now(),
    collaborationPresenceTtlMs,
    sessionId,
    action === "leave" ? "leave" : "heartbeat"
  );
  return asStatus(raw);
}

export async function promoteCollaborationSession(redis: Redis, documentId: string, sessionId: string) {
  const raw = await redis.eval(promoteScript, 2, collaborationPresenceKey(documentId), collaborationStateKey(documentId), Date.now(), collaborationPresenceTtlMs, sessionId) as [string, string, string, string];
  return { promoted: raw[0] === "1", mode: raw[1] as CollaborationSessionMode, participants: Number(raw[2]), leaderId: raw[3] || null };
}

export async function demoteCollaborationSession(redis: Redis, documentId: string) {
  const raw = await redis.eval(demoteScript, 2, collaborationPresenceKey(documentId), collaborationStateKey(documentId), Date.now(), collaborationPresenceTtlMs) as [string, string, string];
  return { demoted: raw[0] === "1", mode: raw[1] as CollaborationSessionMode, participants: Number(raw[2]) };
}

export async function collaborationSessionStatus(redis: Redis, documentId: string): Promise<CollaborationSessionStatus> {
  const [mode, leaderId] = await redis.hmget(collaborationStateKey(documentId), "mode", "leader");
  const participants = await redis.zcount(collaborationPresenceKey(documentId), Date.now() - collaborationPresenceTtlMs, "+inf");
  return { mode: (mode || "local") as CollaborationSessionMode, participants, leaderId: leaderId || null };
}
