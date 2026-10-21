import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { io } from "socket.io-client";

const API = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

let failed = false;
let dealId = null;
const userIds = [];
const sockets = [];

const check = (name, ok, extra = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "  -> " + extra : ""}`);
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
    email: `notification-${randomUUID()}@example.test`,
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
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function main() {
  const brand = await register("BRAND", "Notification Test Brand");
  const influencer = await register("INFLUENCER", "Notification Test Creator");
  const outsider = await register("BRAND", "Notification Test Outsider");
  const brandSocket = await connect(brand.token);
  const influencerSocket = await connect(influencer.token);
  const outsiderSocket = await connect(outsider.token);

  check("Logged-out visitor cannot list notifications", (await api("/notifications")).status === 401);

  const before = await api("/notifications", { token: brand.token });
  check("Brand can list notifications and unread count", before.status === 200 && Array.isArray(before.data.notifications) && Number.isInteger(before.data.unreadCount));

  const created = await api("/deals", {
    method: "POST",
    token: brand.token,
    body: {
      influencerId: influencer.id,
      title: "Notification test deal",
      brief: "Test a notification after accepting this barter offer.",
      collaborationType: "BARTER",
      amount: 0,
      advancePercent: 50,
      barterDescription: "Dinner for two",
    },
  });
  dealId = created.data.dealId;
  check("Test barter offer created", created.status === 201 && Boolean(dealId));
  if (!dealId) return;

  const brandEvent = waitFor(brandSocket, "notification:new");
  const influencerEvent = waitFor(influencerSocket, "notification:new", 1200);
  const outsiderEvent = waitFor(outsiderSocket, "notification:new", 1200);
  const accepted = await api(`/deals/${dealId}/actions`, {
    method: "POST",
    token: influencer.token,
    body: { action: "accept" },
  });
  check("Barter offer can be accepted", accepted.status === 200 && accepted.data.status === "IN_PROGRESS");

  const [received, influencerReceived, outsiderReceived] = await Promise.all([
    brandEvent,
    influencerEvent,
    outsiderEvent,
  ]);
  check("Other participant receives the live notification", received?.dealId === dealId && received?.action === "accept");
  check("Actor does not receive their own notification", influencerReceived === null);
  check("Outsider receives no notification", outsiderReceived === null);

  const listed = await api("/notifications", { token: brand.token });
  const item = listed.data.notifications?.find((n) => n.dealId === dealId && n.action === "accept");
  check("Notification is persisted for the recipient", Boolean(item && item.readAt === null));
  check("Unread count increases by one", listed.data.unreadCount === before.data.unreadCount + 1);

  const influencerList = await api("/notifications", { token: influencer.token });
  const outsiderList = await api("/notifications", { token: outsider.token });
  check("Actor cannot see the recipient's notification", !influencerList.data.notifications?.some((n) => n.id === item?.id));
  check("Outsider cannot see the notification", !outsiderList.data.notifications?.some((n) => n.id === item?.id));

  if (item) {
    const actorRead = await api(`/notifications/${item.id}/read`, {
      method: "PATCH",
      token: influencer.token,
    });
    const outsiderRead = await api(`/notifications/${item.id}/read`, {
      method: "PATCH",
      token: outsider.token,
    });
    check("Another participant cannot mark it read", actorRead.status === 404);
    check("Outsider cannot mark it read", outsiderRead.status === 404);

    const marked = await api(`/notifications/${item.id}/read`, {
      method: "PATCH",
      token: brand.token,
    });
    const repeated = await api(`/notifications/${item.id}/read`, {
      method: "PATCH",
      token: brand.token,
    });
    check("Recipient can mark it read", marked.status === 200 && Boolean(marked.data.readAt));
    check("Repeated mark-read is safe", repeated.status === 200 && repeated.data.readAt === marked.data.readAt);

    const after = await api("/notifications", { token: brand.token });
    check("Read notification no longer counts as unread", after.data.unreadCount === before.data.unreadCount);
  }
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
    if (dealId) {
      const id = new mongoose.Types.ObjectId(dealId);
      await mongoose.connection.db.collection("notifications").deleteMany({ deal: id });
      await mongoose.connection.db.collection("deals").deleteOne({ _id: id });
    }
    if (userIds.length) {
      await mongoose.connection.db.collection("users").deleteMany({ _id: { $in: userIds } });
    }
  }
  await mongoose.disconnect();
  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}
