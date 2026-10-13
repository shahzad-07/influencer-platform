import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { getToken } from "./api";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000";

let socket: Socket | null = null;

// One shared connection for the whole app, created the first time it's needed
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      // A function, so every (re)connect attempt sends the current token
      auth: (cb) => cb({ token: getToken() }),
    });
  }
  return socket;
}

// Call on logout so the next user gets a fresh connection with their own token
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
