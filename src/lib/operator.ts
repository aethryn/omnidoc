import "server-only";

export function isOperator(userId:string|undefined) {
  if(!userId)return false;
  return new Set((process.env.OPERATOR_USER_IDS||"").split(",").map((value)=>value.trim()).filter(Boolean)).has(userId);
}
