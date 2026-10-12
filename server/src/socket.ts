import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { ConversationModel } from "./modules/chat/conversation.model";
import type { AuthPayload } from "./modules/auth/auth.middleware";

type Ack = (res: { ok: boolean; error?: string }) => void;

let io: Server | null = null;

const roomName = (conversationId: string) => `conversation:${conversationId}`;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL ?? "http://localhost:5173" },
  });

  // Runs once per connection: reject anyone without a valid token
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      return next(new Error("Not authenticated"));
    }
    try {
      socket.data.user = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as AuthPayload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    // Join a conversation's room, only if I'm one of its two participants
    socket.on(
      "conversation:join",
      async (conversationId: unknown, ack?: Ack) => {
        const reply: Ack = typeof ack === "function" ? ack : () => {};
        try {
          if (
            typeof conversationId !== "string" ||
            !mongoose.isValidObjectId(conversationId)
          ) {
            return reply({ ok: false, error: "Invalid conversation id" });
          }
          const { userId } = socket.data.user as AuthPayload;
          const allowed = await ConversationModel.exists({
            _id: conversationId,
            $or: [{ brand: userId }, { influencer: userId }],
          });
          if (!allowed) {
            return reply({ ok: false, error: "Conversation not found" });
          }
          await socket.join(roomName(conversationId));
          reply({ ok: true });
        } catch {
          reply({ ok: false, error: "Could not join conversation" });
        }
      },
    );

    socket.on("conversation:leave", (conversationId: unknown) => {
      if (typeof conversationId === "string") {
        socket.leave(roomName(conversationId));
      }
    });
  });

  return io;
}

// Used by the chat routes to push a saved message to everyone in the room
export function emitNewMessage(conversationId: string, message: unknown) {
  io?.to(roomName(conversationId)).emit("message:new", {
    conversationId,
    message,
  });
}
