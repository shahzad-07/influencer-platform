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
  throw new Error("Refusing to run schedule integration checks against production");
}

let failed = false;
let dealId = "";
async function cleanupFixtures() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Test database connection is not ready for fixture cleanup");
  const users = db.collection("users");
  const fixtures = await users.find({
    email: { $regex: /^schedule-[0-9a-f-]{36}@example\.test$/i },
  }).project({ _id: 1 }).toArray();
  const ids = fixtures.map((user) => user._id);
  if (!ids.length) return;

  const deals = db.collection("deals");
  const dealFixtures = await deals.find({
    $or: [{ brand: { $in: ids } }, { influencer: { $in: ids } }],
  }).project({ _id: 1 }).toArray();
  const dealIds = dealFixtures.map((deal) => deal._id);
  if (dealIds.length) {
    await db.collection("notifications").deleteMany({ deal: { $in: dealIds } });
    await db.collection("draftversions").deleteMany({ deal: { $in: dealIds } });
    await deals.deleteMany({ _id: { $in: dealIds } });
  }
  await db.collection("notifications").deleteMany({ recipient: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
}

function check(name, ok) {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

async function request(path, { method = "GET", token, body } = {}) {
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

async function register(role) {
  const result = await request("/auth/register", {
    method: "POST",
    body: {
      name: `Schedule test ${role}`,
      email: `schedule-${randomUUID()}@example.test`,
      password: randomBytes(24).toString("base64url"),
      role,
    },
  });
  if (result.status !== 201 || !result.data.token || !result.data.user?.id) {
    throw new Error(`Could not create a temporary test account (HTTP ${result.status})`);
  }
  return { id: result.data.user.id, token: result.data.token };
}

async function main() {
  try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  // Remove fixtures left by an interrupted run before creating fresh ones.
  await cleanupFixtures();
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) throw new Error("Start the local server with npm run dev before this test");

  const brand = await register("BRAND");
  const creator = await register("INFLUENCER");
  const outsider = await register("BRAND");
  const offer = await request("/deals", {
    method: "POST",
    token: brand.token,
    body: {
      influencerId: creator.id,
      title: "Schedule test deal",
      brief: "Temporary deal for schedule integration checks",
      amount: 100,
      advancePercent: 50,
    },
  });
  dealId = offer.data.dealId;
  if (offer.status !== 201 || !dealId) throw new Error(`Could not create test deal (HTTP ${offer.status})`);

  check("unauthenticated schedule list is rejected", (await request("/deals/schedule")).status === 401);
  const offeredList = await request("/deals/schedule", { token: brand.token });
  check("an unaccepted offer is hidden from Schedule", offeredList.status === 200 && !offeredList.data.schedules.some((row) => row.dealId === dealId));
  const beforeAccept = await request(`/deals/${dealId}/schedule`, {
    method: "PUT",
    token: brand.token,
    body: { visitPlan: { mode: "FIXED", scheduledAt: "2026-11-12T18:30" }, goLiveDeadline: "" },
  });
  check("a visit cannot be scheduled before deal acceptance", beforeAccept.status === 409);
  await mongoose.connection.db.collection("deals").updateOne(
    { _id: new mongoose.Types.ObjectId(dealId) },
    { $set: { status: "ACCEPTED" } },
  );
  const initial = await request("/deals/schedule", { token: brand.token });
  check("both participants see the accepted deal on Schedule", initial.status === 200 && initial.data.schedules.some((row) => row.dealId === dealId));

  const outsiderUpdate = await request(`/deals/${dealId}/schedule`, {
    method: "PUT",
    token: outsider.token,
    body: { visitPlan: null, goLiveDeadline: "" },
  });
  check("non-participant cannot change a schedule", outsiderUpdate.status === 404);

  const badRange = await request(`/deals/${dealId}/schedule`, {
    method: "PUT",
    token: creator.token,
    body: { visitPlan: { mode: "FLEXIBLE", startDate: "2026-11-10", endDate: "2026-11-09" }, goLiveDeadline: "" },
  });
  check("flexible window rejects an end date before its start", badRange.status === 400);

  const fixed = await request(`/deals/${dealId}/schedule`, {
    method: "PUT",
    token: brand.token,
    body: { visitPlan: { mode: "FIXED", scheduledAt: "2026-11-12T18:30" }, goLiveDeadline: "2026-11-20" },
  });
  const afterFixed = await request("/deals/schedule", { token: creator.token });
  const fixedItem = afterFixed.data.schedules?.find((row) => row.dealId === dealId);
  check("brand can save a fixed IST visit and optional deadline", fixed.status === 200 && fixedItem?.visitPlan?.mode === "FIXED" && fixedItem?.goLiveDeadline === "2026-11-20");
  check("fixed visit is stored at the correct IST instant", fixedItem?.visitPlan?.scheduledAt === "2026-11-12T13:00:00.000Z");

  const flexible = await request(`/deals/${dealId}/schedule`, {
    method: "PUT",
    token: creator.token,
    body: { visitPlan: { mode: "FLEXIBLE", startDate: "2026-11-16", endDate: "2026-11-22" }, goLiveDeadline: "" },
  });
  const afterFlexible = await request("/deals/schedule", { token: brand.token });
  const flexibleItem = afterFlexible.data.schedules?.find((row) => row.dealId === dealId);
  check("creator can replace it with one flexible date window", flexible.status === 200 && flexibleItem?.visitPlan?.mode === "FLEXIBLE" && flexibleItem?.visitPlan?.startDate === "2026-11-16" && flexibleItem?.visitPlan?.endDate === "2026-11-22");
  check("optional go-live date can be cleared", flexibleItem?.goLiveDeadline === "");

  const invalidDate = await request(`/deals/${dealId}/schedule`, {
    method: "PUT",
    token: brand.token,
    body: { visitPlan: null, goLiveDeadline: "2026-02-30" },
  });
  check("impossible calendar dates are rejected", invalidDate.status === 400);

  for (const status of ["DECLINED", "COMPLETED"]) {
    await mongoose.connection.db.collection("deals").updateOne(
      { _id: new mongoose.Types.ObjectId(dealId) },
      { $set: { status } },
    );
    const list = await request("/deals/schedule", { token: brand.token });
    const update = await request(`/deals/${dealId}/schedule`, {
      method: "PUT",
      token: brand.token,
      body: { visitPlan: null, goLiveDeadline: "" },
    });
    check(`${status.toLowerCase()} deal is hidden and cannot be scheduled`, !list.data.schedules.some((row) => row.dealId === dealId) && update.status === 409);
  }
} finally {
  if (mongoose.connection.readyState === 1) {
    try {
      await cleanupFixtures();
      console.log("Temporary schedule test accounts, deals, and notifications were removed.");
    } finally {
      await mongoose.disconnect();
    }
  }
}
}

main()
  .then(() => {
    if (failed) {
      console.error("\nSome schedule checks FAILED");
      process.exitCode = 1;
    } else {
      console.log("\nAll schedule integration checks passed");
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Schedule checks failed");
    process.exitCode = 1;
  });
