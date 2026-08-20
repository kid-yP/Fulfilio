import { io, Socket } from "socket.io-client";
import { API_URL, getTokens } from "./api";

let socket: Socket | null = null;

// One connection per browser tab, reused across pages. Auth happens once at
// connect time via the handshake `auth` payload (see api/src/realtime/socket.ts) —
// matches how the API's socket middleware expects the access token.
export function getSocket(): Socket | null {
  const tokens = getTokens();
  if (!tokens) return null;

  if (!socket) {
    socket = io(API_URL, {
      auth: { token: tokens.accessToken },
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function joinWorkspace(workspaceId: string) {
  const s = getSocket();
  s?.emit("workspace:join", workspaceId);
}
