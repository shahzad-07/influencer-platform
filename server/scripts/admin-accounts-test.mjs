import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { io } from "socket.io-client";

const API = process.env.TEST_API_URL ?? "http://localhost:5000/api";
const SOCKET_URL = process.env.TEST_SOCKET_URL ?? new URL(API).origin;

let failed = false;
const userIds = [];
const sockets = [];
let conversationId = null;

function check(name, ok) {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function register(role, name) {
  const account = {
    name,
    email: `admin-account-${randomUUID()}@example.test`,
    password: randomBytes(24).toString("base64url"),
    role,
  };
  const result = await api("/auth/register", { method: "POST", body: account });
  if (result.status !== 201 || !result.data.user?.id) {
    throw new Error(`Could not create temporary ${role.toLowerCase()} account (HTTP ${result.status})`);
  }
  userIds.push(new mongoose.Types.ObjectId(result.data.user.id));
  return { ...account, id: result.data.user.id, token: result.data.token };
}

async function login(account) {
  return api("/auth/login", {
    method: "POST",
    body: { email: account.email, password: account.password },
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { auth: { token }, reconnection: false });
    socket.on("connect", () => {
      sockets.push(socket);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      socket.close();
      reject(new Error(error.message));
    });
  });
}

function waitFor(socket, event, timeout = 1800) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data ?? true);
    });
  });
}

async function insertProfiles(brandId, creatorId, viewerId) {
  const now = new Date();
  await mongoose.connection.db.collection("brandprofiles").insertOne({
    user: new mongoose.Types.ObjectId(brandId),
    companyName: "Admin Account Test Brand",
    industry: "Other",
    location: "Bengaluru",
    socialLinks: [],
    createdAt: now,
    updatedAt: now,
  });
  await mongoose.connection.db.collection("profiles").insertMany([
    {
      user: new mongoose.Types.ObjectId(creatorId),
      bio: "Temporary account removal test profile",
      niches: [],
      followerCount: 0,
      languages: [],
      location: "Bengaluru",
      socialLinks: [],
      imagePath: "",
      portfolio: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      user: new mongoose.Types.ObjectId(viewerId),
      bio: "Temporary active profile used to check brand discovery",
      niches: [],
      followerCount: 0,
      languages: [],
      location: "Bengaluru",
      socialLinks: [],
      imagePath: "",
      portfolio: [],
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

async function main() {
  const brand = await register("BRAND", "Admin Account Test Brand");
  const creator = await register("INFLUENCER", "Admin Account Test Creator");
  const viewer = await register("INFLUENCER", "Admin Account Test Viewer");
  const admin = await register("BRAND", "Admin Account Test Admin");
  await insertProfiles(brand.id, creator.id, viewer.id);

  await mongoose.connection.db.collection("users").updateOne(
    { _id: new mongoose.Types.ObjectId(admin.id) },
    { $set: { role: "ADMIN" } },
  );
  const adminLogin = await login(admin);
  if (adminLogin.status !== 200 || !adminLogin.data.token) {
    throw new Error("Could not log in the temporary admin account");
  }
  admin.token = adminLogin.data.token;

  const brandLogin = await login(brand);
  const creatorLogin = await login(creator);
  const viewerLogin = await login(viewer);
  if (![brandLogin, creatorLogin, viewerLogin].every((result) => result.status === 200)) {
    throw new Error("Could not log in the temporary brand or creator accounts");
  }
  brand.token = brandLogin.data.token;
  creator.token = creatorLogin.data.token;
  viewer.token = viewerLogin.data.token;

  const initialAccounts = await api("/admin/accounts?limit=50", { token: admin.token });
  const listedBrand = initialAccounts.data.accounts?.find((account) => account._id === brand.id);
  check("Admin can list accounts without password hashes", initialAccounts.status === 200 && Boolean(listedBrand) && !("passwordHash" in listedBrand));
  check("New accounts start active", listedBrand?.accountStatus === "ACTIVE");
  const forbiddenList = await api("/admin/accounts", { token: brand.token });
  check("Non-admin cannot list accounts", forbiddenList.status === 403);
  const selfRemoval = await api(`/admin/accounts/${admin.id}/status`, {
    method: "PATCH",
    token: admin.token,
    body: { action: "REMOVE", reason: "Temporary admin self-removal test." },
  });
  check("Admin accounts cannot be removed through the account tool", selfRemoval.status === 404);

  const listedCreatorBefore = await api("/influencers?limit=20", { token: brand.token });
  check("Active creator appears in brand discovery", listedCreatorBefore.data.influencers?.some((item) => item.id === creator.id));
  const listedBrandBefore = await api("/brands?limit=20", { token: viewer.token });
  check("Active brand appears in creator discovery", listedBrandBefore.data.brands?.some((item) => item.id === brand.id));

  const brandSocket = await connect(brand.token);
  const accountInactiveEvent = waitFor(brandSocket, "auth:inactive");
  const suspended = await api(`/admin/accounts/${brand.id}/status`, {
    method: "PATCH",
    token: admin.token,
    body: { action: "SUSPEND", reason: "Temporary account suspension test." },
  });
  check("Admin can suspend a brand", suspended.status === 200 && suspended.data.account?.accountStatus === "SUSPENDED");
  check("Suspending disconnects active sockets", (await accountInactiveEvent) === true);
  const suspendedToken = await api("/auth/me", { token: brand.token });
  check("Suspension blocks existing API tokens", suspendedToken.status === 401 && suspendedToken.data.code === "ACCOUNT_INACTIVE");
  const suspendedLogin = await login(brand);
  check("Suspension blocks new logins", suspendedLogin.status === 403 && suspendedLogin.data.code === "ACCOUNT_INACTIVE");
  const hiddenBrand = await api("/brands?limit=20", { token: viewer.token });
  check("Suspended brand is hidden from discovery", !hiddenBrand.data.brands?.some((item) => item.id === brand.id));

  const restored = await api(`/admin/accounts/${brand.id}/status`, {
    method: "PATCH",
    token: admin.token,
    body: { action: "RESTORE", reason: "Temporary account restoration test." },
  });
  check("Admin can restore a suspended account", restored.status === 200 && restored.data.account?.accountStatus === "ACTIVE");
  const restoredLogin = await login(brand);
  check("Restored brand can log in again", restoredLogin.status === 200 && Boolean(restoredLogin.data.token));
  brand.token = restoredLogin.data.token;
  const restoredBrandDiscovery = await api("/brands?limit=20", { token: viewer.token });
  check("Restored brand returns to discovery", restoredBrandDiscovery.data.brands?.some((item) => item.id === brand.id));

  conversationId = new mongoose.Types.ObjectId();
  const oldMessageId = new mongoose.Types.ObjectId();
  const now = new Date();
  await mongoose.connection.db.collection("conversations").insertOne({
    _id: conversationId,
    brand: new mongoose.Types.ObjectId(brand.id),
    influencer: new mongoose.Types.ObjectId(creator.id),
    lastMessageText: "Test history remains",
    lastMessageAt: now,
    brandLastReadAt: now,
    influencerLastReadAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await mongoose.connection.db.collection("messages").insertOne({
    _id: oldMessageId,
    conversation: conversationId,
    sender: new mongoose.Types.ObjectId(creator.id),
    text: "Old message retained after soft removal",
    createdAt: now,
    updatedAt: now,
  });

  const creatorSocket = await connect(creator.token);
  const creatorInactiveEvent = waitFor(creatorSocket, "auth:inactive");
  const removed = await api(`/admin/accounts/${creator.id}/status`, {
    method: "PATCH",
    token: admin.token,
    body: { action: "REMOVE", reason: "Temporary soft removal test." },
  });
  check("Admin can soft-remove a creator", removed.status === 200 && removed.data.account?.accountStatus === "REMOVED");
  check("Soft removal disconnects active sockets", (await creatorInactiveEvent) === true);
  const removedToken = await api("/auth/me", { token: creator.token });
  check("Soft removal blocks existing API tokens", removedToken.status === 401 && removedToken.data.code === "ACCOUNT_INACTIVE");
  const removedLogin = await login(creator);
  check("Soft removal blocks new logins", removedLogin.status === 403 && removedLogin.data.code === "ACCOUNT_INACTIVE");
  const hiddenCreator = await api("/influencers?limit=20", { token: brand.token });
  check("Removed creator is hidden from discovery", !hiddenCreator.data.influencers?.some((item) => item.id === creator.id));
  const hiddenCreatorDetail = await api(`/influencers/${creator.id}`, { token: brand.token });
  check("Removed creator profile cannot be opened", hiddenCreatorDetail.status === 404);

  const retainedUser = await mongoose.connection.db.collection("users").findOne({
    _id: new mongoose.Types.ObjectId(creator.id),
  });
  const retainedProfile = await mongoose.connection.db.collection("profiles").findOne({
    user: new mongoose.Types.ObjectId(creator.id),
  });
  const retainedHistory = await api(`/chat/conversations/${conversationId}/messages`, { token: brand.token });
  check("Soft removal retains user and profile records", retainedUser?.accountStatus === "REMOVED" && Boolean(retainedProfile));
  check("Existing chat history remains readable", retainedHistory.status === 200 && retainedHistory.data.messages?.some((message) => message.id === String(oldMessageId)));
  const newMessage = await api(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    token: brand.token,
    body: { text: "This should not reach the removed user" },
  });
  check("New messages are blocked to a removed account", newMessage.status === 409);

  const [brandAudit, creatorAudit] = await Promise.all([
    api(`/admin/accounts/${brand.id}/audit`, { token: admin.token }),
    api(`/admin/accounts/${creator.id}/audit`, { token: admin.token }),
  ]);
  check("Suspend and restore actions have audit history", brandAudit.data.events?.length === 2 && brandAudit.data.events[0]?.action === "RESTORE" && brandAudit.data.events[1]?.action === "SUSPEND");
  check("Soft removal reason is recorded in audit history", creatorAudit.data.events?.length === 1 && creatorAudit.data.events[0]?.action === "REMOVE" && creatorAudit.data.events[0]?.reason === "Temporary soft removal test.");
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
} catch (error) {
  failed = true;
  console.error("Script error:", error instanceof Error ? error.message : "Unknown error");
} finally {
  for (const socket of sockets) socket.close();
  if (mongoose.connection.db) {
    const ids = userIds;
    if (conversationId) {
      await mongoose.connection.db.collection("messages").deleteMany({ conversation: conversationId });
      await mongoose.connection.db.collection("conversations").deleteOne({ _id: conversationId });
    }
    if (ids.length) {
      await mongoose.connection.db.collection("accountaudits").deleteMany({
        $or: [{ targetUser: { $in: ids } }, { actor: { $in: ids } }],
      });
      await mongoose.connection.db.collection("brandprofiles").deleteMany({ user: { $in: ids } });
      await mongoose.connection.db.collection("profiles").deleteMany({ user: { $in: ids } });
      await mongoose.connection.db.collection("users").deleteMany({ _id: { $in: ids } });
    }
  }
  await mongoose.disconnect();
  console.log(failed ? "\nSome checks FAILED" : "\nAll admin account checks passed");
  process.exit(failed ? 1 : 0);
}
