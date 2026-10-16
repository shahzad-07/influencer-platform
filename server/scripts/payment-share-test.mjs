import "dotenv/config";
import mongoose from "mongoose";

const API = "http://localhost:5000/api";
const PASSWORD = "password123";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: PASSWORD },
  influencer: {
    email: process.env.INFLUENCER_EMAIL ?? "Shahzad@gmail.com",
    password: process.env.INFLUENCER_PASSWORD ?? "Shahzad@07",
  },
};

// Obviously fake test values
const FAKE = {
  accountHolderName: "Test Influencer",
  bankName: "Test Bank",
  accountNumber: "123456789012",
  ifsc: "HDFC0001234",
  upiId: "testinfluencer@okhdfc",
};

let failed = false;
const check = (name, ok, extra = "") => {
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "  -> " + extra : ""}`,
  );
};
const show = (r) => `${r.status} ${JSON.stringify(r.data)}`;

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    data: await res.json().catch(() => ({})),
    headers: res.headers,
  };
}

// Log in, or create the account first if it doesn't exist yet
async function ensureLogin({ email, password }, name, role) {
  let r = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!r.data.token) {
    r = await api("/auth/register", {
      method: "POST",
      body: { name, email, password, role },
    });
  }
  if (!r.data.token)
    throw new Error(`Could not log in as ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

async function main() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok)
    throw new Error(
      "The server is not responding on port 5000. Start it with npm run dev first.",
    );
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is missing from server/.env");

  const brandT = await ensureLogin(ACCOUNTS.brand, "Test Brand", "BRAND");
  const infT = await ensureLogin(
    ACCOUNTS.influencer,
    "Test Influencer",
    "INFLUENCER",
  );
  const otherInfT = await ensureLogin(
    { email: "other@test.com", password: PASSWORD },
    "Other Person",
    "INFLUENCER",
  );
  const brand2T = await ensureLogin(
    { email: "brand2@test.com", password: PASSWORD },
    "Second Brand",
    "BRAND",
  );

  const infId = (await api("/auth/me", { token: infT })).data.user._id;

  await mongoose.connect(process.env.MONGODB_URI);
  const oid = (s) => new mongoose.Types.ObjectId(s);
  const sharesCol = () => mongoose.connection.db.collection("payment_shares");

  const dealIds = [];
  const newDeal = async (title) => {
    const r = await api("/deals", {
      method: "POST",
      token: brandT,
      body: {
        influencerId: infId,
        title,
        brief: "Test brief for the payment share checks.",
        amount: 500000,
        advancePercent: 50,
      },
    });
    dealIds.push(r.data.dealId);
    return r.data.dealId;
  };
  let refCounter = 0;
  const act = (token, dealId, action, extra = {}) => {
    const needsRef = action === "markAdvanceSent" || action === "markFinalSent";
    const withRef =
      needsRef && !extra.reference
        ? { ...extra, reference: `TESTREF${Date.now()}${refCounter++}` }
        : extra;
    return api(`/deals/${dealId}/actions`, {
      method: "POST",
      token,
      body: { action, ...withRef },
    });
  };
  const share = (dealId, stage, token = infT) =>
    api("/payment-shares", { method: "POST", token, body: { dealId, stage } });
  const view = (dealId, stage, token = brandT) =>
    api(`/payment-shares/deal/${dealId}/${stage}/view`, { token });
  const status = (dealId, token) =>
    api(`/payment-shares/deal/${dealId}`, { token });
  const revoke = (dealId, stage, token = infT) =>
    api(`/payment-shares/deal/${dealId}/${stage}`, { method: "DELETE", token });

  // Start with no saved details
  await api("/payment-details/me", { method: "DELETE", token: infT });

  // ---- Sharing needs saved details and the right stage ----
  const dealA = await newDeal("Share test A");
  await act(infT, dealA, "accept");
  const noDetails = await share(dealA, "ADVANCE");
  check(
    "Cannot share before saving payment details",
    noDetails.status === 409 &&
      /payment details/i.test(noDetails.data.message ?? ""),
    show(noDetails),
  );

  const saved = await api("/payment-details/me", {
    method: "PUT",
    token: infT,
    body: FAKE,
  });
  check("Influencer saves payment details", saved.status === 200, show(saved));

  const dealB = await newDeal("Share test B (still an offer)");
  check(
    "Cannot share on a deal that is only an offer",
    (await share(dealB, "ADVANCE")).status === 409,
  );
  check(
    "Cannot share the final stage during the advance stage",
    (await share(dealA, "FINAL")).status === 409,
  );
  check(
    "A brand cannot share",
    (await share(dealA, "ADVANCE", brandT)).status === 403,
  );
  check(
    "Another influencer cannot share on this deal",
    (await share(dealA, "ADVANCE", otherInfT)).status === 404,
  );
  check(
    "Unknown stage is rejected",
    (await share(dealA, "MIDDLE")).status === 400,
  );
  check(
    "Bad deal id is rejected",
    (await share("abc", "ADVANCE")).status === 400,
  );

  // ---- A valid share ----
  const shared = await share(dealA, "ADVANCE");
  const hours =
    (new Date(shared.data.expiresAt).getTime() - Date.now()) / 3600000;
  check(
    "Influencer shares the advance details",
    shared.status === 201,
    show(shared),
  );
  check(
    "The share lasts 6 hours",
    hours > 5.98 && hours <= 6.001,
    `${hours.toFixed(3)} hours`,
  );
  const again = await share(dealA, "ADVANCE");
  check(
    "Sharing again while a share is open is refused",
    again.status === 409,
    show(again),
  );

  // ---- Status endpoint: no bank details in it ----
  const brandStatus = await status(dealA, brandT);
  check(
    "Brand sees that the advance is shared",
    brandStatus.status === 200 &&
      brandStatus.data.shares?.some((s) => s.stage === "ADVANCE"),
    show(brandStatus),
  );
  check(
    "The status response holds no bank details",
    !JSON.stringify(brandStatus.data).includes(FAKE.accountNumber) &&
      !JSON.stringify(brandStatus.data).includes(FAKE.upiId),
  );
  check(
    "An outsider cannot see the deal's share status",
    (await status(dealA, otherInfT)).status === 404,
  );
  check(
    "Another brand cannot see it either",
    (await status(dealA, brand2T)).status === 404,
  );

  // ---- The brand's view ----
  const viewed = await view(dealA, "ADVANCE");
  check(
    "Brand sees the full details",
    viewed.status === 200 &&
      viewed.data.details?.accountNumber === FAKE.accountNumber &&
      viewed.data.details?.ifsc === FAKE.ifsc &&
      viewed.data.details?.upiId === FAKE.upiId,
    show(viewed),
  );
  check(
    "The advance amount due is 250000 paise",
    viewed.data.amountDue === 250000,
    String(viewed.data.amountDue),
  );
  const uri = viewed.data.upiUri ?? "";
  check(
    "The UPI link has the right amount and UPI ID",
    uri.startsWith("upi://pay?") &&
      uri.includes("am=2500.00") &&
      decodeURIComponent(uri).includes(FAKE.upiId),
    uri,
  );
  check(
    "The response is marked no-store",
    (viewed.headers.get("cache-control") ?? "").includes("no-store"),
  );
  check(
    "A lowercase stage in the URL works too",
    (await view(dealA, "advance")).status === 200,
  );
  check(
    "Viewing the final stage fails (only the advance is shared)",
    (await view(dealA, "FINAL")).status === 404,
  );
  check(
    "An influencer cannot use the brand's view",
    (await view(dealA, "ADVANCE", infT)).status === 403,
  );
  check(
    "Another influencer cannot either",
    (await view(dealA, "ADVANCE", otherInfT)).status === 403,
  );
  check(
    "Another brand gets nothing",
    (await view(dealA, "ADVANCE", brand2T)).status === 404,
  );
  check(
    "A logged-out visitor is blocked",
    (await api(`/payment-shares/deal/${dealA}/ADVANCE/view`)).status === 401,
  );

  // ---- Audit trail ----
  const logRes = await status(dealA, infT);
  check(
    "The log records the share and the brand's views",
    logRes.data.log?.some(
      (l) => l.event === "SHARED" && l.by === "INFLUENCER",
    ) && logRes.data.log?.some((l) => l.event === "VIEWED" && l.by === "BRAND"),
    show(logRes),
  );
  check(
    "The log holds no bank details",
    !JSON.stringify(logRes.data.log).includes(FAKE.accountNumber),
  );

  // ---- Expiry (the code must not depend on MongoDB's slow cleanup) ----
  await sharesCol().updateOne(
    { deal: oid(dealA), stage: "ADVANCE" },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  check(
    "An expired share cannot be viewed, even before MongoDB cleans it up",
    (await view(dealA, "ADVANCE")).status === 404,
  );
  const afterExpiry = await status(dealA, brandT);
  check(
    "An expired share is not listed as open",
    afterExpiry.data.shares?.length === 0,
    show(afterExpiry),
  );
  const reshare = await share(dealA, "ADVANCE");
  check(
    "The influencer can share again after expiry",
    reshare.status === 201,
    show(reshare),
  );
  check(
    "The brand can view the new share",
    (await view(dealA, "ADVANCE")).status === 200,
  );

  // ---- Revoking ----
  check(
    "A brand cannot end a share",
    (await revoke(dealA, "ADVANCE", brandT)).status === 403,
  );
  check(
    "The influencer ends the share early",
    (await revoke(dealA, "ADVANCE")).status === 200,
  );
  check(
    "The brand can no longer view the details",
    (await view(dealA, "ADVANCE")).status === 404,
  );
  check(
    "Ending a share twice gives 404",
    (await revoke(dealA, "ADVANCE")).status === 404,
  );
  const afterRevoke = await status(dealA, infT);
  check(
    "The log records the early end",
    afterRevoke.data.log?.some((l) => l.event === "REVOKED"),
    show(afterRevoke),
  );
  check(
    "The influencer can share again after ending one",
    (await share(dealA, "ADVANCE")).status === 201,
  );

  // ---- Moving through the deal ----
  check(
    "Brand marks the advance sent",
    (await act(brandT, dealA, "markAdvanceSent")).status === 200,
  );
  const afterSent = await view(dealA, "ADVANCE");
  check(
    "Details close once the deal moves past the advance stage",
    afterSent.status === 409,
    show(afterSent),
  );
  check(
    "Influencer says 'not received'",
    (await act(infT, dealA, "rejectAdvance")).status === 200,
  );
  check(
    "Details open again when the deal returns to the advance stage",
    (await view(dealA, "ADVANCE")).status === 200,
  );

  await act(brandT, dealA, "markAdvanceSent");
  await act(infT, dealA, "confirmAdvance");
  await act(infT, dealA, "submitDraft", { url: "https://example.com/draft" });
  await act(brandT, dealA, "approveDraft");
  await act(infT, dealA, "submitLink", { url: "https://example.com/post" });
  const verified = await act(brandT, dealA, "verifyLink");
  check(
    "The deal reaches the final payment stage",
    verified.status === 200 && verified.data.status === "LINK_VERIFIED",
    show(verified),
  );
  check(
    "The old advance share is useless now",
    (await view(dealA, "ADVANCE")).status === 409,
  );

  check(
    "The influencer shares the final details",
    (await share(dealA, "FINAL")).status === 201,
  );
  const finalView = await view(dealA, "FINAL");
  check(
    "The final amount due is 250000 paise",
    finalView.status === 200 &&
      finalView.data.amountDue === 250000 &&
      finalView.data.upiUri.includes("am=2500.00"),
    show(finalView),
  );

  // ---- Deleting the details ends every share ----
  const del = await api("/payment-details/me", {
    method: "DELETE",
    token: infT,
  });
  check("Influencer deletes the saved payment details", del.status === 200);
  check(
    "The brand can no longer view the details",
    (await view(dealA, "FINAL")).status === 404,
  );
  check(
    "Every share for that influencer is gone from the database",
    (await sharesCol().countDocuments({ deal: oid(dealA) })) === 0,
  );

  // ---- Database setup ----
  const indexes = await sharesCol().indexes();
  check(
    "The automatic-deletion (TTL) index exists",
    indexes.some((i) => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0),
    JSON.stringify(indexes.map((i) => i.key)),
  );

  // ---- Clean up ----
  await sharesCol().deleteMany({ deal: { $in: dealIds.map(oid) } });
  await mongoose.disconnect();

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Script error:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
