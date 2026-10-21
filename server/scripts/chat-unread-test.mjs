import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { io } from "socket.io-client";

const API = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

let failed = false;
let conversationId = null;
const userIds = [];
const overflowConversationIds = [];
const sockets = [];

const check = (name, ok) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function register(role, name) {
  const account = {
    name,
    email: `chat-unread-${randomUUID()}@example.test`,
    password: randomBytes(24).toString("base64url"),
    role,
  };
  const result = await api("/auth/register", { method: "POST", body: account });
  if (result.status !== 201 || !result.data.token || !result.data.user?.id) {
    throw new Error(`Could not create a temporary ${role.toLowerCase()} test account (HTTP ${result.status})`);
  }
  userIds.push(new mongoose.Types.ObjectId(result.data.user.id));
  return { id: result.data.user.id, token: result.data.token };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: false,
    });
    socket.on("connect", () => {
      sockets.push(socket);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      socket.close();
      reject(new Error(err.message));
    });
  });
}

function waitFor(socket, event, timeout = 2500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function main() {
  const brand = await register("BRAND", "Chat Unread Test Brand");
  const creator = await register("INFLUENCER", "Chat Unread Test Creator");
  const outsider = await register("BRAND", "Chat Unread Test Outsider");
  const brandSocket = await connect(brand.token);
  const creatorSocket = await connect(creator.token);
  const outsiderSocket = await connect(outsider.token);

  check("Logged-out visitor cannot list conversations", (await api("/chat/conversations")).status === 401);

  const created = await api("/chat/conversations", {
    method: "POST",
    token: brand.token,
    body: { influencerId: creator.id },
  });
  conversationId = created.data.conversationId;
  check("Participants can create a conversation", created.status === 200 && Boolean(conversationId));
  if (!conversationId) return;

  const creatorMessageEvent = waitFor(creatorSocket, "chat:changed");
  const brandMessageEvent = waitFor(brandSocket, "chat:changed", 1200);
  const outsiderMessageEvent = waitFor(outsiderSocket, "chat:changed", 1200);
  const sent = await api(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    token: brand.token,
    body: { text: "Unread test message" },
  });
  check("Participant can send a message", sent.status === 201 && sent.data.message?.text === "Unread test message");
  const [creatorChanged, brandChanged, outsiderChanged] = await Promise.all([
    creatorMessageEvent,
    brandMessageEvent,
    outsiderMessageEvent,
  ]);
  check("Recipient receives a live chat refresh event", creatorChanged === true);
  check("Sender receives no unread refresh event", brandChanged === null);
  check("Outsider receives no chat refresh event", outsiderChanged === null);

  const creatorList = await api("/chat/conversations", { token: creator.token });
  const creatorConversation = creatorList.data.conversations?.find((item) => item.id === conversationId);
  check("Recipient sees the conversation in their list", Boolean(creatorConversation));
  check("New incoming message increments recipient unread count", creatorConversation?.unreadCount === 1 && creatorList.data.unreadTotal === 1);

  const outsiderList = await api("/chat/conversations", { token: outsider.token });
  check("Outsider cannot see participants' conversation", outsiderList.status === 200 && outsiderList.data.conversations?.length === 0);
  const outsiderRead = await api(`/chat/conversations/${conversationId}/read`, {
    method: "PATCH",
    token: outsider.token,
  });
  check("Outsider cannot mark the conversation read", outsiderRead.status === 404);

  const creatorReadEvent = waitFor(creatorSocket, "chat:changed");
  const brandReadEvent = waitFor(brandSocket, "chat:changed", 1200);
  const outsiderReadEvent = waitFor(outsiderSocket, "chat:changed", 1200);
  const marked = await api(`/chat/conversations/${conversationId}/read`, {
    method: "PATCH",
    token: creator.token,
  });
  check("Participant can mark the conversation read", marked.status === 200 && Boolean(marked.data.readAt));
  const [creatorReadChanged, brandReadChanged, outsiderReadChanged] =
    await Promise.all([creatorReadEvent, brandReadEvent, outsiderReadEvent]);
  check("Reader receives a live chat refresh event", creatorReadChanged === true);
  check("Other participant receives no read refresh event", brandReadChanged === null);
  check("Outsider receives no read refresh event", outsiderReadChanged === null);

  const afterRead = await api("/chat/conversations", { token: creator.token });
  const readConversation = afterRead.data.conversations?.find((item) => item.id === conversationId);
  check("Read message no longer counts as unread", readConversation?.unreadCount === 0 && afterRead.data.unreadTotal === 0);

  const senderList = await api("/chat/conversations", { token: brand.token });
  const senderConversation = senderList.data.conversations?.find((item) => item.id === conversationId);
  check("Sender's own message is not unread", senderConversation?.unreadCount === 0);

  const creatorObjectId = new mongoose.Types.ObjectId(creator.id);
  const epoch = new Date(0);
  const overflowRows = Array.from({ length: 51 }, (_, index) => {
    const id = new mongoose.Types.ObjectId();
    overflowConversationIds.push(id);
    return {
      _id: id,
      brand: new mongoose.Types.ObjectId(),
      influencer: creatorObjectId,
      lastMessageText: "",
      lastMessageAt: new Date(Date.now() + (index + 1) * 1000),
      brandLastReadAt: epoch,
      influencerLastReadAt: epoch,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
  await mongoose.connection.db.collection("conversations").insertMany(overflowRows);
  await mongoose.connection.db.collection("messages").insertOne({
    conversation: overflowConversationIds[0],
    sender: overflowRows[0].brand,
    text: "Unread message outside the visible list",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const overflowList = await api("/chat/conversations", { token: creator.token });
  check("Conversation list remains capped at 50", overflowList.data.conversations?.length === 50);
  check("Unread total includes a message outside the visible 50", overflowList.data.unreadTotal === 1 && !overflowList.data.conversations.some((item) => item.id === String(overflowConversationIds[0])));
}

try {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from the local server environment");
  }
  const databaseName = new URL(process.env.MONGODB_URI).pathname
    .split("/")
    .filter(Boolean)[0]
    ?.toLowerCase();
  if (databaseName === "influencerprod") {
    throw new Error("This test refuses to run against the production database");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await main();
} catch (err) {
  failed = true;
  console.error("Script error:", err instanceof Error ? err.message : "Unknown error");
} finally {
  for (const socket of sockets) socket.close();
  if (mongoose.connection.db) {
    if (overflowConversationIds.length) {
      await mongoose.connection.db.collection("messages").deleteMany({
        conversation: { $in: overflowConversationIds },
      });
      await mongoose.connection.db.collection("conversations").deleteMany({
        _id: { $in: overflowConversationIds },
      });
    }
    if (conversationId) {
      const id = new mongoose.Types.ObjectId(conversationId);
      await mongoose.connection.db.collection("messages").deleteMany({ conversation: id });
      await mongoose.connection.db.collection("conversations").deleteOne({ _id: id });
    }
    if (userIds.length) {
      await mongoose.connection.db.collection("users").deleteMany({ _id: { $in: userIds } });
    }
  }
  await mongoose.disconnect();
  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}
