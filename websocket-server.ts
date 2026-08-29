#!/usr/bin/env tsx

import WebSocket, { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import http from "http";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@/generated/prisma";

//server config w/ env variables
const PORT = parseInt(process.env.WEBSOCKET_PORT || "4000");
const HOST = process.env.WEBSOCKET_HOST || "localhost";
const prisma = new PrismaClient();

//in-memory storage for active documents and connections
//each document ID maps to its Yjs document instance
const documents = new Map<string, Y.Doc>();
//each document ID maps to a set of active websocket connections
const connections = new Map<
  string,
  Set<{
    ws: WebSocket;
    userId: string;
  }>
>();

// Message types from y-protocols
const messageSync = 0;
const messageAwareness = 1;

// Helper to extract cookie token
function getCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

//basic http server
const server = http.createServer((request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/plain",
  });
  response.end("Yjs ws-server running\n");
});

//create wss attached to the http server
const wss = new WebSocketServer({ server });

//handle new ws connections
wss.on("connection", async (ws: WebSocket, req: http.IncomingMessage) => {
  //extract URL params and path
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);

  // Support room from query param or pathname (y-websocket default: /roomName)
  const roomCode = url.searchParams.get("room") || url.pathname.replace(/^\//, "").trim();

  // Extract auth token from query param, Authorization header, or Cookie header
  const token =
    url.searchParams.get("token") ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    getCookieToken(req.headers.cookie);

  if (!roomCode || !token) {
    console.log("Missing connection parameters:", { roomCode: !!roomCode, token: !!token });
    ws.close(1008, "Room and authentication token are required");
    return;
  }

  // Verify JWT token and extract authenticated userId
  let userId: string;
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
    if (!decoded || !decoded.userId) {
      console.log("Invalid token payload:", decoded);
      ws.close(1008, "Invalid authentication token");
      return;
    }
    userId = decoded.userId;
  } catch (error: any) {
    console.log("WebSocket token verification failed:", error.message);
    ws.close(1008, "Authentication failed or token expired");
    return;
  }

  // Validate room authorization in database
  let room;
  try {
    room = await prisma.room.findFirst({
      where: {
        code: roomCode,
        isActive: true,
        participants: {
          some: {
            userId,
          },
        },
      },
      include: {
        document: true,
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      console.log("Room access denied:", { roomCode, userId });
      ws.close(1008, "Room not found or user not authorized");
      return;
    }

    console.log(
      `[${new Date().toISOString()}] User ${userId} authenticated & connected to room ${roomCode}`
    );
  } catch (error) {
    console.error("Error connecting to room: ", error);
    ws.close(1011, "Internal Server Error");
    return;
  }

  //create new Yjs document if it doesn't exist for this room
  if (!documents.has(roomCode)) {
    const doc = new Y.Doc(); //create a new Yjs doc
    documents.set(roomCode, doc); //store the document in the map

    //init shared-types
    const ytext = doc.getText("content"); //shared text content
    const awareness = new awarenessProtocol.Awareness(doc); //track cursor positions

    //load initial content if available
    if (room.document?.content) {
      ytext.insert(0, room.document.content);
      console.log(`Loaded existing content for room ${roomCode}`);
    }

    // Listen to document updates to broadcast to all clients
    doc.on("update", (update: Uint8Array, origin: any) => {
      // Don't broadcast if the update came from this websocket (to avoid loops)
      if (origin !== ws) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        const message = encoding.toUint8Array(encoder);

        connections.get(roomCode)?.forEach(({ ws: client }) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message, { binary: true });
          }
        });
      }
    });
  }

  const doc = documents.get(roomCode)!; //get the document from the map

  //track connection for this room
  if (!connections.has(roomCode)) {
    connections.set(roomCode, new Set());
  }
  connections.get(roomCode)!.add({ ws, userId });

  // Send initial sync message (SyncStep1)
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder), { binary: true });

  // Handle incoming messages
  ws.on("message", (message: Buffer) => {
    const uint8Array = new Uint8Array(message);
    const decoder = decoding.createDecoder(uint8Array);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync:
        // Read the sync message type
        const responseEncoder = encoding.createEncoder();
        encoding.writeVarUint(responseEncoder, messageSync);
        syncProtocol.readSyncMessage(decoder, responseEncoder, doc, ws);

        // Send response if needed
        if (encoding.length(responseEncoder) > 1) {
          ws.send(encoding.toUint8Array(responseEncoder), { binary: true });
        }
        break;

      case messageAwareness:
        // Broadcast awareness updates (cursor positions, etc.)
        connections.get(roomCode)?.forEach(({ ws: client }) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(message, { binary: true });
          }
        });
        break;
    }
  });

  console.log(
    `Active connections in ${roomCode}: ${connections.get(roomCode)?.size}`
  );

  //handle onClose event for ws
  ws.on("close", async () => {
    console.log(`Connection closed for room: ${roomCode} by user: ${userId}`);
    const roomConnections = connections.get(roomCode);

    // Remove this specific connection
    if (roomConnections) {
      roomConnections.forEach((conn) => {
        if (conn.ws === ws && conn.userId === userId) {
          roomConnections.delete(conn);
        }
      });
    }

    //clean up room when last connection is closed
    if (roomConnections?.size === 0) {
      // Save final document state
      try {
        const doc = documents.get(roomCode);
        if (doc && room.document) {
          const content = doc.getText("content").toString();
          await prisma.document.update({
            where: { id: room.document.id },
            data: {
              content,
              lastEditedAt: new Date(),
            },
          });
          console.log(`Saved final content for room ${roomCode}`);
        }
      } catch (error) {
        console.error("Failed to save document:", error);
      }

      connections.delete(roomCode);
      documents.delete(roomCode);
      console.log(`Room ${roomCode} cleaned up`);
    }
  });

  //handle errors
  ws.on("error", (error) => {
    console.error(`WebSocket error ${error.message}`);
  });
});

//start the server
server.listen(PORT, HOST, () => {
  console.log(`Websocket server started at ws://${HOST}:${PORT}`);
  console.log(`HOST: ${HOST}`);
  console.log(`PORT: ${PORT}`);
  console.log(`URL: ws://${HOST}:${PORT}`);
  console.log(`Status: Ready for connections`);
  console.log("=".repeat(60));
});

//gracefully handle shutdown
const shutdown = () => {
  console.log(`\n\nShutting down ws-server...`);

  //close all the active connections
  let totalConnections = 0;
  connections.forEach((roomConnections) => {
    roomConnections.forEach(({ ws: client }) => {
      client.close();
      totalConnections++;
    });
  });

  console.log(`Closed ${totalConnections} active connection(s)`);

  server.close(async () => {
    await prisma.$disconnect();
    console.log(`Server closed successfully`);
    process.exit(0);
  });
};

//register shutdown handlers
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error(`Uncaught Exception: ${error.message}`);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
