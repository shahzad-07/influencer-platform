import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";

const API = "http://localhost:5000/api";
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing from server/.env");
const databaseName = (() => {
  try { return new URL(uri).pathname.slice(1); } catch { return ""; }
})();
if (process.env.NODE_ENV === "production" || /prod|production/i.test(databaseName)) {
  throw new Error("Refusing to run campaign integration checks against production");
}

const runId = randomUUID();
const emailPrefix = `campaign-${runId}`;
const ids = [];
const campaignIds = [];
let failed = false;

function check(name, ok, extra = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? `  -> ${extra}` : ""}`);
}

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function register(role) {
  const result = await request("/auth/register", {
    method: "POST",
    body: {
      name: `Campaign test ${role}`,
      email: `${emailPrefix}-${role.toLowerCase()}@example.test`,
      password: randomBytes(24).toString("base64url"),
      role,
    },
  });
  if (result.status !== 201 || !result.data.token || !result.data.user?.id) {
    throw new Error(`Could not create a temporary test account (HTTP ${result.status})`);
  }
  ids.push(result.data.user.id);
  return { id: result.data.user.id, token: result.data.token };
}

async function cleanup() {
  const db = mongoose.connection.db;
  if (!db) return;
  const fixtureUsers = await db.collection("users").find({
    email: { $regex: /^campaign-[0-9a-f-]{36}-(brand|influencer)@example\.test$/i },
  }).project({ _id: 1 }).toArray();
  const userIds = [...new Set([...ids, ...fixtureUsers.map((user) => String(user._id))])]
    .map((id) => new mongoose.Types.ObjectId(id));
  const ownCampaigns = userIds.length
    ? await db.collection("campaigns").find({ brand: { $in: userIds } }).project({ _id: 1 }).toArray()
    : [];
  const campaignObjectIds = [...new Set([
    ...campaignIds,
    ...ownCampaigns.map((campaign) => String(campaign._id)),
  ])].map((id) => new mongoose.Types.ObjectId(id));
  if (userIds.length === 0 && campaignObjectIds.length === 0) return;
  const conversations = await db.collection("conversations").find({
    $or: [{ brand: { $in: userIds } }, { influencer: { $in: userIds } }],
  }).project({ _id: 1 }).toArray();
  const conversationIds = conversations.map((item) => item._id);
  const deals = await db.collection("deals").find({
    $or: [
      { brand: { $in: userIds } }, { influencer: { $in: userIds } },
      ...(campaignObjectIds.length ? [{ campaign: { $in: campaignObjectIds } }] : []),
    ],
  }).project({ _id: 1 }).toArray();
  const dealIds = deals.map((item) => item._id);
  await db.collection("notifications").deleteMany({
    $or: [
      { recipient: { $in: userIds } },
      ...(campaignObjectIds.length ? [{ campaign: { $in: campaignObjectIds } }] : []),
      ...(dealIds.length ? [{ deal: { $in: dealIds } }] : []),
    ],
  });
  if (dealIds.length) await db.collection("draftversions").deleteMany({ deal: { $in: dealIds } });
  if (conversationIds.length) await db.collection("messages").deleteMany({ conversation: { $in: conversationIds } });
  await db.collection("conversations").deleteMany({ _id: { $in: conversationIds } });
  await db.collection("deals").deleteMany({ _id: { $in: dealIds } });
  if (campaignObjectIds.length) {
    await db.collection("campaignapplications").deleteMany({ campaign: { $in: campaignObjectIds } });
    await db.collection("campaigns").deleteMany({ _id: { $in: campaignObjectIds } });
  }
  await db.collection("profiles").deleteMany({ user: { $in: userIds } });
  await db.collection("brandprofiles").deleteMany({ user: { $in: userIds } });
  await db.collection("payment_details").deleteMany({ user: { $in: userIds } });
  await db.collection("paymentshares").deleteMany({ influencer: { $in: userIds } });
  await db.collection("users").deleteMany({ _id: { $in: userIds } });
}

async function main() {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    await cleanup();
    const health = await fetch(`${API}/health`).catch(() => null);
    if (!health?.ok) throw new Error("Start the local server with npm run dev before this test");

    const brand = await register("BRAND");
    const creator = await register("INFLUENCER");
    const secondCreator = await register("INFLUENCER");
    const differentProfileCreator = await register("INFLUENCER");
    const graceCreator = await register("INFLUENCER");

    for (const token of [creator.token, secondCreator.token]) {
      const profile = await request("/profiles/me", { method: "PUT", token, body: {
        niches: ["food"], followerCount: 90000, languages: ["English"],
      } });
      check("creator can save self-declared campaign profile fields", profile.status === 200 && profile.data.profile.followerCount === 90000);
    }
    const differentProfile = await request("/profiles/me", { method: "PUT", token: differentProfileCreator.token, body: {
      niches: ["travel"], followerCount: 9000, languages: ["Hindi"],
    } });
    check("creator can save a profile outside campaign preferences", differentProfile.status === 200);
    const graceProfile = await request("/profiles/me", { method: "PUT", token: graceCreator.token, body: {
      niches: ["food"], followerCount: 9000, languages: ["Kannada"],
    } });
    check("creator can save one language and 90 percent of preferred followers", graceProfile.status === 200);

    check("logged-out visitor cannot browse campaigns", (await request("/campaigns")).status === 401);
    check("creator cannot post a campaign", (await request("/campaigns", { method: "POST", token: creator.token, body: {} })).status === 403);

    const campaignResult = await request("/campaigns", { method: "POST", token: brand.token, body: {
      title: "Campaign integration check",
      brief: "Create one short food video for this temporary integration campaign.",
      niche: "food", minFollowers: 10000, languages: ["English", "Kannada"], creatorSlots: 1,
      collaborationType: "PAID", barterDescription: "",
    } });
    const campaignId = campaignResult.data.campaign?.id;
    if (campaignId) campaignIds.push(campaignId);
    check("brand can post a campaign", campaignResult.status === 201 && Boolean(campaignId));

    const creatorCampaigns = await request("/campaigns", { token: creator.token });
    check("matching creator sees the open campaign", creatorCampaigns.status === 200 && creatorCampaigns.data.campaigns.some((item) => item.id === campaignId));
    const differentProfileCampaigns = await request("/campaigns", { token: differentProfileCreator.token });
    check("creator outside niche, language and follower preferences sees campaign", differentProfileCampaigns.status === 200 && differentProfileCampaigns.data.campaigns.some((item) => item.id === campaignId));
    const graceCampaigns = await request("/campaigns", { token: graceCreator.token });
    check("creator at 90 percent with one preferred language sees campaign", graceCampaigns.status === 200 && graceCampaigns.data.campaigns.some((item) => item.id === campaignId));
    const notifications = await request("/notifications", { token: creator.token });
    check("matched creator receives a campaign notification", notifications.data.notifications?.some((item) => item.action === "campaignNew" && item.campaignId === campaignId));

    const interest = await request(`/campaigns/${campaignId}/interest`, { method: "POST", token: creator.token });
    check("creator matching preferred profile can express interest", interest.status === 201 && interest.data.status === "INTERESTED");
    const differentProfileInterest = await request(`/campaigns/${campaignId}/interest`, { method: "POST", token: differentProfileCreator.token });
    check("creator outside niche, language and follower preferences can express interest", differentProfileInterest.status === 201 && differentProfileInterest.data.status === "INTERESTED");
    const graceInterest = await request(`/campaigns/${campaignId}/interest`, { method: "POST", token: graceCreator.token });
    check("creator at 90 percent with one preferred language can express interest", graceInterest.status === 201 && graceInterest.data.status === "INTERESTED");
    const brandNotifications = await request("/notifications", { token: brand.token });
    check("brand receives campaign interest notifications", brandNotifications.data.notifications?.filter((item) => item.action === "campaignInterest" && item.campaignId === campaignId).length === 3);

    const applicants = await request(`/campaigns/${campaignId}/applicants`, { token: brand.token });
    check("brand can see applicants with matching and different profiles", applicants.status === 200 && applicants.data.applicants.length === 3);
    check("creator cannot access the brand applicant list", (await request(`/campaigns/${campaignId}/applicants`, { token: creator.token })).status === 403);

    const conversation = await request("/chat/conversations", { method: "POST", token: brand.token, body: { influencerId: creator.id } });
    const shared = await request(`/chat/conversations/${conversation.data.conversationId}/messages`, { method: "POST", token: brand.token, body: { campaignId } });
    const history = await request(`/chat/conversations/${conversation.data.conversationId}/messages`, { token: creator.token });
    check("brand can share a campaign card in chat", shared.status === 201 && shared.data.message?.campaign?.id === campaignId);
    check("creator can load the shared campaign card", history.data.messages?.some((item) => item.campaign?.id === campaignId));
    check("creator cannot share a brand campaign", (await request(`/campaigns/${campaignId}/share`, { method: "POST", token: creator.token, body: { creatorIds: [secondCreator.id] } })).status === 403);
    const bulkShare = await request(`/campaigns/${campaignId}/share`, { method: "POST", token: brand.token, body: { creatorIds: [creator.id, secondCreator.id] } });
    const secondConversations = await request("/chat/conversations", { token: secondCreator.token });
    const secondConversation = secondConversations.data.conversations?.find((item) => item.otherUser.id === brand.id);
    const secondMessages = secondConversation
      ? await request(`/chat/conversations/${secondConversation.id}/messages`, { token: secondCreator.token })
      : { data: { messages: [] } };
    check("brand can send a campaign message to selected creators", bulkShare.status === 201 && bulkShare.data.sharedCount === 2);
    check("selected creator receives the campaign card in Messages", secondMessages.data.messages?.some((item) => item.campaign?.id === campaignId));

    const mismatch = await request("/deals", { method: "POST", token: brand.token, body: {
      campaignId, influencerId: creator.id, title: "Wrong type", brief: "This offer should not change campaign terms.",
      collaborationType: "BARTER", barterDescription: "A free meal for two", amount: 0, advancePercent: 0,
    } });
    check("deal offer cannot change campaign collaboration type", mismatch.status === 409);

    await request("/payment-details/me", { method: "PUT", token: creator.token, body: {
      accountHolderName: "Temporary Test Creator", bankName: "", accountNumber: "", ifsc: "", upiId: "campaign-test@upi",
    } });
    const offer = await request("/deals", { method: "POST", token: brand.token, body: {
      campaignId, influencerId: creator.id, title: "Campaign food video", brief: "Create one short food video and tag the restaurant.",
      collaborationType: "PAID", amount: 50000, advancePercent: 50,
    } });
    const dealId = offer.data.dealId;
    check("brand can create a campaign-linked offer", offer.status === 201 && Boolean(dealId));
    const offerNotReserved = await request(`/campaigns/${campaignId}`, { token: brand.token });
    check("pending deal offer does not consume a creator spot", offerNotReserved.data.campaign.remainingSlots === 1);

    const accepted = await request(`/deals/${dealId}/actions`, { method: "POST", token: creator.token, body: { action: "accept" } });
    const full = await request(`/campaigns/${campaignId}`, { token: brand.token });
    check("accepted deal consumes one creator spot", accepted.status === 200 && full.data.campaign.remainingSlots === 0);
    const fullInterest = await request(`/campaigns/${campaignId}/interest`, { method: "POST", token: secondCreator.token });
    check("no more interested creator can take a full campaign", fullInterest.status === 409);

    const cancelled = await request(`/deals/${dealId}/actions`, { method: "POST", token: brand.token, body: { action: "cancel" } });
    const reopened = await request(`/campaigns/${campaignId}`, { token: brand.token });
    check("cancelling an agreed deal reopens the campaign spot", cancelled.status === 200 && reopened.data.campaign.remainingSlots === 1);
    const reopenedInterest = await request(`/campaigns/${campaignId}/interest`, { method: "POST", token: secondCreator.token });
    check("another creator can apply after the spot reopens", reopenedInterest.status === 201);
  } finally {
    try {
      await cleanup();
      if (ids.length) console.log("Temporary campaign test accounts and related data were removed.");
    } finally {
      await mongoose.disconnect();
    }
  }
}

main().then(() => {
  if (failed) {
    console.error("\nSome campaign checks FAILED");
    process.exitCode = 1;
  } else {
    console.log("\nAll campaign integration checks passed");
  }
}).catch((error) => {
  console.error(error instanceof Error ? error.message : "Campaign checks failed");
  process.exitCode = 1;
});
