import { NextResponse } from "next/server";

// Collaboration sessions now connect directly to the Yjs WebSocket whenever
// the document has an active share or accepted collaborator. Keep this retired
// endpoint explicit so stale browser bundles stop retrying the old Redis
// heartbeat protocol and reload onto the current editor flow.
export async function POST() {
  return NextResponse.json(
    { error: "The collaboration coordinator has been retired", code: "COORDINATOR_RETIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
