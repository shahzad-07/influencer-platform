import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { io } from "socket.io-client";

const API = process.env.TEST_API_URL ?? "http://localhost:5000/api";
const SOCKET_URL = process.env.TEST_SOCKET_URL ?? new URL(API).origin;

let failed = false;
let dealId = null;
const userIds = [];
const sockets = [];

const check = (name, ok, extra = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "  -> " + extra : ""}`);
};

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
    email: `admin-notification-${randomUUID()}@example.test`,
    password: randomBytes(24).toString("base64url"),
    role,
  };
  const result = await api("/auth/register", { method: "POST", body: account });
  if (result.status !== 201 || !result.data.user?.id) {
    throw new Error(`Could not create temporary ${role.toLowerCase()} test account (HTTP ${result.status})`);
  }
  userIds.push(new mongoose.Types.ObjectId(result.data.user.id));
  return { id: result.data.user.id, email: account.email, password: account.password };
}

async function login(account) {
  const result = await api("/auth/login", {
    method: "POST",
    body: { email: account.email, password: account.password },
  });
  if (result.status !== 200 || !result.data.token) {
    throw new Error(`Could not log in a temporary test account (HTTP ${result.status})`);
  }
  return { ...account, token: result.data.token };
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
      resolve(data);
    });
  });
}

function isAdminTrustNotification(event, expectedDealId) {
  return event?.dealId === expectedDealId &&
    event?.action === "adminTrustMarkUpdated" &&
    event?.actorRole === "ADMIN";
}

async function main() {
  const brand = await register("BRAND", "Admin Notification Test Brand");
  const creator = await register("INFLUENCER", "Admin Notification Test Creator");
  const outsider = await register("BRAND", "Admin Notification Test Outsider");
  const adminAccount = await register("BRAND", "Admin Notification Test Admin");

  await mongoose.connection.db.collection("brandprofiles").insertOne({
    user: new mongoose.Types.ObjectId(brand.id),
    companyName: "Admin Notification Test Brand",
    industry: "Other",
    location: "Bengaluru",
    socialLinks: [{ platform: "INSTAGRAM", url: "https://instagram.com/test" }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await mongoose.connection.db.collection("users").updateOne(
    { _id: new mongoose.Types.ObjectId(adminAccount.id) },
    { $set: { role: "ADMIN" } },
  );

  const brandSession = await login(brand);
  const creatorSession = await login(creator);
  const outsiderSession = await login(outsider);
  const adminSession = await login(adminAccount);

  const created = await api("/deals", {
    method: "POST",
    token: brandSession.token,
    body: {
      influencerId: creator.id,
      title: "Admin notification test deal",
      brief: "Temporary deal used to test admin trust notifications.",
      collaborationType: "BARTER",
      amount: 0,
      advancePercent: 50,
      barterDescription: "A temporary test collaboration",
    },
  });
  dealId = created.data.dealId;
  check("Temporary barter deal created", created.status === 201 && Boolean(dealId));
  if (!dealId) return;

  const accepted = await api(`/deals/${dealId}/actions`, {
    method: "POST",
    token: creatorSession.token,
    body: { action: "accept" },
  });
  check("Creator accepts the temporary offer", accepted.status === 200);

  const brandSocket = await connect(brandSession.token);
  const creatorSocket = await connect(creatorSession.token);
  const outsiderSocket = await connect(outsiderSession.token);

  const disputeEvent = waitFor(brandSocket, "notification:new");
  const noCreatorDisputeEvent = waitFor(creatorSocket, "notification:new", 500);
  const noOutsiderDisputeEvent = waitFor(outsiderSocket, "notification:new", 500);
  const disputed = await api(`/deals/${dealId}/actions`, {
    method: "POST",
    token: creatorSession.token,
    body: { action: "dispute", note: "Temporary admin notification test dispute." },
  });
  check("Temporary dispute opened", disputed.status === 200 && disputed.data.status === "DISPUTED");
  const [receivedDispute, creatorOwnDispute, outsiderDispute] = await Promise.all([
    disputeEvent,
    noCreatorDisputeEvent,
    noOutsiderDisputeEvent,
  ]);
  check("Existing dispute notification reached the other participant", receivedDispute?.action === "dispute");
  check("Dispute actor and outsider received no dispute notification", creatorOwnDispute === null && outsiderDispute === null);

  const dispute = await mongoose.connection.db.collection("disputes").findOne({
    deal: new mongoose.Types.ObjectId(dealId),
    state: "OPEN",
  });
  if (!dispute) throw new Error("Temporary dispute record was not found");

  const beforeResolveBrand = waitFor(brandSocket, "notification:new");
  const beforeResolveCreator = waitFor(creatorSocket, "notification:new");
  const beforeResolveOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const resolved = await api(`/admin/disputes/${dispute._id}/resolve`, {
    method: "POST",
    token: adminSession.token,
    body: { trustMark: "PAYMENT_PENDING", reason: "Temporary trust mark notification test." },
  });
  check("Admin resolves dispute with a test trust mark", resolved.status === 200);
  const [brandResolveEvent, creatorResolveEvent, outsiderResolveEvent] = await Promise.all([
    beforeResolveBrand,
    beforeResolveCreator,
    beforeResolveOutsider,
  ]);
  check("Both deal participants receive a live trust mark notification", isAdminTrustNotification(brandResolveEvent, dealId) && isAdminTrustNotification(creatorResolveEvent, dealId));
  check("Outsider receives no trust mark notification", outsiderResolveEvent === null);

  const correctedBrand = waitFor(brandSocket, "notification:new");
  const correctedCreator = waitFor(creatorSocket, "notification:new");
  const correctedOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const corrected = await api(`/admin/disputes/${dispute._id}/trust-mark`, {
    method: "PATCH",
    token: adminSession.token,
    body: { trustMark: "DELIVERABLE_PENDING", reason: "Temporary correction notification test." },
  });
  check("Admin corrects the test trust mark", corrected.status === 200);
  const [brandCorrectionEvent, creatorCorrectionEvent, outsiderCorrectionEvent] = await Promise.all([
    correctedBrand,
    correctedCreator,
    correctedOutsider,
  ]);
  check("Both participants receive a live correction notification", isAdminTrustNotification(brandCorrectionEvent, dealId) && isAdminTrustNotification(creatorCorrectionEvent, dealId));
  check("Outsider receives no correction notification", outsiderCorrectionEvent === null);

  const clearedBrand = waitFor(brandSocket, "notification:new");
  const clearedCreator = waitFor(creatorSocket, "notification:new");
  const clearedOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const cleared = await api(`/admin/disputes/${dispute._id}/trust-mark`, {
    method: "PATCH",
    token: adminSession.token,
    body: { trustMark: "NONE", reason: "Temporary mark cleanup notification test." },
  });
  check("Admin clears the test trust mark", cleared.status === 200);
  const [brandClearEvent, creatorClearEvent, outsiderClearEvent] = await Promise.all([
    clearedBrand,
    clearedCreator,
    clearedOutsider,
  ]);
  check("Both participants receive a live clear notification", isAdminTrustNotification(brandClearEvent, dealId) && isAdminTrustNotification(creatorClearEvent, dealId));
  check("Outsider receives no clear notification", outsiderClearEvent === null);

  const reopenWithMark = await api(`/deals/${dealId}/actions`, {
    method: "POST",
    token: creatorSession.token,
    body: { action: "dispute", note: "Temporary second dispute with an active mark." },
  });
  check("A later dispute can be opened after the prior one is resolved", reopenWithMark.status === 200);
  const secondDispute = await mongoose.connection.db.collection("disputes").findOne({
    deal: new mongoose.Types.ObjectId(dealId),
    state: "OPEN",
  });
  if (!secondDispute) throw new Error("Second temporary dispute was not found");
  const secondMarkBrand = waitFor(brandSocket, "notification:new");
  const secondMarkCreator = waitFor(creatorSocket, "notification:new");
  const secondMarkOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const secondMarked = await api(`/admin/disputes/${secondDispute._id}/resolve`, {
    method: "POST",
    token: adminSession.token,
    body: { trustMark: "DELIVERABLE_PENDING", reason: "Temporary later dispute mark test." },
  });
  check("Admin resolves a later dispute with a new active mark", secondMarked.status === 200);
  const [secondBrandEvent, secondCreatorEvent, secondOutsiderEvent] = await Promise.all([
    secondMarkBrand,
    secondMarkCreator,
    secondMarkOutsider,
  ]);
  check("Both participants receive the later mark notification", isAdminTrustNotification(secondBrandEvent, dealId) && isAdminTrustNotification(secondCreatorEvent, dealId));
  check("Outsider receives no later mark notification", secondOutsiderEvent === null);

  const reopenWithoutMark = await api(`/deals/${dealId}/actions`, {
    method: "POST",
    token: creatorSession.token,
    body: { action: "dispute", note: "Temporary third dispute with no new mark." },
  });
  check("A third dispute can be opened after the second is resolved", reopenWithoutMark.status === 200);
  const thirdDispute = await mongoose.connection.db.collection("disputes").findOne({
    deal: new mongoose.Types.ObjectId(dealId),
    state: "OPEN",
  });
  if (!thirdDispute) throw new Error("Third temporary dispute was not found");
  const noNewMarkBrand = waitFor(brandSocket, "notification:new");
  const noNewMarkCreator = waitFor(creatorSocket, "notification:new");
  const noNewMarkOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const thirdResolved = await api(`/admin/disputes/${thirdDispute._id}/resolve`, {
    method: "POST",
    token: adminSession.token,
    body: { trustMark: "NONE", reason: "Temporary later review without a new mark." },
  });
  check("Admin resolves a later dispute without a mark", thirdResolved.status === 200);
  const [noNewBrandEvent, noNewCreatorEvent, noNewOutsiderEvent] = await Promise.all([
    noNewMarkBrand,
    noNewMarkCreator,
    noNewMarkOutsider,
  ]);
  check("Clearing the older mark notifies both participants", isAdminTrustNotification(noNewBrandEvent, dealId) && isAdminTrustNotification(noNewCreatorEvent, dealId));
  check("Outsider receives no automatic clear notification", noNewOutsiderEvent === null);

  const [clearedOlderDispute, automaticClearAudit] = await Promise.all([
    mongoose.connection.db.collection("disputes").findOne({ _id: secondDispute._id }),
    mongoose.connection.db.collection("disputeaudits").findOne({
      dispute: secondDispute._id,
      action: "TRUST_MARK_CHANGED",
      previousMark: "DELIVERABLE_PENDING",
      nextMark: "NONE",
    }),
  ]);
  check("The older mark is inactive after the no-mark review", clearedOlderDispute?.trustMark === "NONE" && clearedOlderDispute?.trustMarkActive === false);
  check("Automatic clearing is recorded in dispute audit history", Boolean(automaticClearAudit));

  const restoreOlderBrand = waitFor(brandSocket, "notification:new");
  const restoreOlderCreator = waitFor(creatorSocket, "notification:new");
  const restoreOlderOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const restoredOlderMark = await api(`/admin/disputes/${secondDispute._id}/trust-mark`, {
    method: "PATCH",
    token: adminSession.token,
    body: { trustMark: "DELIVERABLE_PENDING", reason: "Temporary older mark correction test." },
  });
  check("Admin can set a mark from a reviewed dispute correction", restoredOlderMark.status === 200);
  const [restoreOlderBrandEvent, restoreOlderCreatorEvent, restoreOlderOutsiderEvent] = await Promise.all([
    restoreOlderBrand,
    restoreOlderCreator,
    restoreOlderOutsider,
  ]);
  check("Both participants receive the correction notification", isAdminTrustNotification(restoreOlderBrandEvent, dealId) && isAdminTrustNotification(restoreOlderCreatorEvent, dealId));
  check("Outsider receives no correction notification", restoreOlderOutsiderEvent === null);

  const replaceBrand = waitFor(brandSocket, "notification:new");
  const replaceCreator = waitFor(creatorSocket, "notification:new");
  const replaceOutsider = waitFor(outsiderSocket, "notification:new", 500);
  const replacement = await api(`/admin/disputes/${thirdDispute._id}/trust-mark`, {
    method: "PATCH",
    token: adminSession.token,
    body: { trustMark: "PAYMENT_PENDING", reason: "Temporary replacement mark correction test." },
  });
  check("A corrected mark replaces the deal's older active mark", replacement.status === 200);
  const [replaceBrandEvent, replaceCreatorEvent, replaceOutsiderEvent] = await Promise.all([
    replaceBrand,
    replaceCreator,
    replaceOutsider,
  ]);
  check("Both participants receive the replacement notification", isAdminTrustNotification(replaceBrandEvent, dealId) && isAdminTrustNotification(replaceCreatorEvent, dealId));
  check("Outsider receives no replacement notification", replaceOutsiderEvent === null);
  const [replacedOlder, activeReplacement] = await Promise.all([
    mongoose.connection.db.collection("disputes").findOne({ _id: secondDispute._id }),
    mongoose.connection.db.collection("disputes").findOne({ _id: thirdDispute._id }),
  ]);
  check("Only the corrected dispute keeps the active mark", replacedOlder?.trustMarkActive === false && activeReplacement?.trustMark === "PAYMENT_PENDING" && activeReplacement?.trustMarkActive === true);

  const finalBrandNotice = waitFor(brandSocket, "notification:new");
  const finalCreatorNotice = waitFor(creatorSocket, "notification:new");
  const finalOutsiderNotice = waitFor(outsiderSocket, "notification:new", 500);
  const finalClear = await api(`/admin/disputes/${thirdDispute._id}/trust-mark`, {
    method: "PATCH",
    token: adminSession.token,
    body: { trustMark: "NONE", reason: "Temporary final mark cleanup test." },
  });
  const [finalBrandEvent, finalCreatorEvent, finalOutsiderEvent] = await Promise.all([
    finalBrandNotice,
    finalCreatorNotice,
    finalOutsiderNotice,
  ]);
  check("Admin can clear the replacement mark", finalClear.status === 200);
  check("Both participants receive the final clear notification", isAdminTrustNotification(finalBrandEvent, dealId) && isAdminTrustNotification(finalCreatorEvent, dealId));
  check("Outsider receives no final clear notification", finalOutsiderEvent === null);

  const [brandNotifications, creatorNotifications, outsiderNotifications] = await Promise.all([
    api("/notifications", { token: brandSession.token }),
    api("/notifications", { token: creatorSession.token }),
    api("/notifications", { token: outsiderSession.token }),
  ]);
  const isPersisted = (result) => result.data.notifications?.filter(
    (item) => item.dealId === dealId && item.action === "adminTrustMarkUpdated",
  ).length === 8;
  check("All eight trust mark notifications are persisted for the brand", isPersisted(brandNotifications));
  check("All eight trust mark notifications are persisted for the creator", isPersisted(creatorNotifications));
  check("Outsider has no trust mark notifications", !outsiderNotifications.data.notifications?.some((item) => item.dealId === dealId && item.action === "adminTrustMarkUpdated"));
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
    if (dealId) {
      const id = new mongoose.Types.ObjectId(dealId);
      const disputeDocs = await mongoose.connection.db.collection("disputes")
        .find({ deal: id }, { projection: { _id: 1 } }).toArray();
      const disputeIds = disputeDocs.map((doc) => doc._id);
      const conversations = await mongoose.connection.db.collection("conversations")
        .find({ brand: { $in: userIds }, influencer: { $in: userIds } }, { projection: { _id: 1 } }).toArray();
      const conversationIds = conversations.map((doc) => doc._id);
      await mongoose.connection.db.collection("messages").deleteMany({ conversation: { $in: conversationIds } });
      await mongoose.connection.db.collection("conversations").deleteMany({ _id: { $in: conversationIds } });
      await mongoose.connection.db.collection("notifications").deleteMany({ deal: id });
      if (disputeIds.length) {
        await mongoose.connection.db.collection("disputeaudits").deleteMany({ dispute: { $in: disputeIds } });
      }
      await mongoose.connection.db.collection("disputes").deleteMany({ deal: id });
      await mongoose.connection.db.collection("deals").deleteOne({ _id: id });
    }
    if (userIds.length) {
      await mongoose.connection.db.collection("brandprofiles").deleteMany({ user: { $in: userIds } });
      await mongoose.connection.db.collection("profiles").deleteMany({ user: { $in: userIds } });
      await mongoose.connection.db.collection("users").deleteMany({ _id: { $in: userIds } });
    }
  }
  await mongoose.disconnect();
  console.log(failed ? "\nSome checks FAILED" : "\nAll admin notification checks passed");
  process.exit(failed ? 1 : 0);
}
