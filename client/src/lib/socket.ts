import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { API_URL, getToken } from "./api";

// The chat server is the same host as the API, without the /api part,
// so there is only one address to set (VITE_API_URL)
const SOCKET_URL = new URL(API_URL, window.location.href).origin;

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
