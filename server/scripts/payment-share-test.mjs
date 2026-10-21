import "dotenv/config";
import mongoose from "mongoose";
import { influencerFromEnv } from "./test-env.mjs";

const API = "http://localhost:5000/api";
const PASSWORD = "password123";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: PASSWORD },
  influencer: influencerFromEnv(),
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
  const db = mongoose.connection.db;
  if (!db) throw new Error("Could not connect to the development database");
  const oid = (s) => new mongoose.Types.ObjectId(s);
  const dealIds = [];
  const logsCol = db.collection("payment_share_logs");

  const newDeal = async (title, terms = {}) => {
    const r = await api("/deals", {
      method: "POST",
      token: brandT,
      body: {
        influencerId: infId,
        title,
        brief: "Test brief for payment detail access checks.",
        amount: 500000,
        advancePercent: 50,
        ...terms,
      },
    });
    if (r.status !== 201 || !r.data.dealId) {
      throw new Error(`Could not create a test deal: ${show(r)}`);
    }
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
  const view = (dealId, stage, token = brandT) =>
    api(`/payment-shares/deal/${dealId}/${stage}/view`, { token });
  const status = (dealId, token) =>
    api(`/payment-shares/deal/${dealId}`, { token });

  try {
    // Start with no saved details
    await api("/payment-details/me", { method: "DELETE", token: infT });

    // ---- Paid acceptance still requires details; barter does not ----
    const dealA = await newDeal("Payment details test A");
    const noDetails = await act(infT, dealA, "accept");
    check(
      "Cannot accept a paid offer before saving payment details",
      noDetails.status === 409 &&
        /payment details/i.test(noDetails.data.message ?? ""),
      show(noDetails),
    );
    const stillOffered = await api(`/deals/${dealA}`, { token: infT });
    check(
      "Paid offer stays offered when acceptance is blocked",
      stillOffered.data.deal?.status === "OFFERED",
      show(stillOffered),
    );

    const barterDeal = await newDeal("Payment details barter", {
      collaborationType: "BARTER",
      barterDescription: "A meal and a drink",
    });
    const barterAccept = await act(infT, barterDeal, "accept");
    check(
      "Can accept a barter offer without payment details",
      barterAccept.status === 200 && barterAccept.data.status === "IN_PROGRESS",
      show(barterAccept),
    );

    const saved = await api("/payment-details/me", {
      method: "PUT",
      token: infT,
      body: FAKE,
    });
    check("Influencer saves payment details", saved.status === 200, show(saved));

    const accepted = await act(infT, dealA, "accept");
    check(
      "Can accept a paid offer after saving payment details",
      accepted.status === 200 && accepted.data.status === "ACCEPTED",
      show(accepted),
    );

    // ---- Direct access is available without a creator sharing each time ----
    const viewed = await view(dealA, "ADVANCE");
    check(
      "Brand sees the full details at the advance stage",
      viewed.status === 200 &&
        viewed.data.details?.accountNumber === FAKE.accountNumber &&
        viewed.data.details?.ifsc === FAKE.ifsc &&
        viewed.data.details?.upiId === FAKE.upiId,
      show(viewed),
    );
    check(
      "The advance amount is returned as whole paise",
      viewed.data.amountDue === 250000,
      String(viewed.data.amountDue),
    );
    const uri = viewed.data.upiUri ?? "";
    check(
      "The UPI link has the amount and UPI ID",
      uri.startsWith("upi://pay?") &&
        uri.includes("am=2500.00") &&
        decodeURIComponent(uri).includes(FAKE.upiId),
      uri,
    );
    check(
      "The response is marked no-store and has no share expiry",
      (viewed.headers.get("cache-control") ?? "").includes("no-store") &&
        !("expiresAt" in viewed.data),
    );
    check("A lowercase stage works", (await view(dealA, "advance")).status === 200);
    check(
      "A final-stage view is blocked during the advance stage",
      (await view(dealA, "FINAL")).status === 409,
    );
    check("An invalid stage is rejected", (await view(dealA, "MIDDLE")).status === 400);
    check("An invalid deal id is rejected", (await view("abc", "ADVANCE")).status === 400);

    const oldShare = await api("/payment-shares", {
      method: "POST",
      token: infT,
      body: { dealId: dealA, stage: "ADVANCE" },
    });
    check("The old creator share endpoint is removed", oldShare.status === 404);

    // ---- Access is restricted to this deal's brand ----
    check("An influencer cannot view the details", (await view(dealA, "ADVANCE", infT)).status === 403);
    check("Another influencer cannot view the details", (await view(dealA, "ADVANCE", otherInfT)).status === 403);
    check("Another brand cannot view the details", (await view(dealA, "ADVANCE", brand2T)).status === 404);
    check("An outsider cannot read the audit log", (await status(dealA, otherInfT)).status === 404);
    check("Another brand cannot read the audit log", (await status(dealA, brand2T)).status === 404);
    check(
      "A logged-out visitor cannot view the details",
      (await api(`/payment-shares/deal/${dealA}/ADVANCE/view`)).status === 401,
    );

    // Each successful view is recorded, while the log contains no payment data.
    const logRes = await status(dealA, infT);
    const brandViews = logRes.data.log?.filter(
      (entry) => entry.event === "VIEWED" && entry.by === "BRAND",
    );
    check("Every successful view appears in the creator's log", brandViews?.length === 2, show(logRes));
    check(
      "The audit log contains no bank details",
      !JSON.stringify(logRes.data.log).includes(FAKE.accountNumber) &&
        !JSON.stringify(logRes.data.log).includes(FAKE.upiId),
    );
    check("The response no longer lists active shares", !("shares" in logRes.data));

    // A saved payment method alone doesn't let a brand view an unaccepted offer.
    const dealB = await newDeal("Payment details test B (offer)");
    check(
      "A brand cannot view details before this offer is accepted",
      (await view(dealB, "ADVANCE")).status === 409,
    );

    // ---- Access closes outside the payment stage and returns when it is due again ----
    check(
      "Advance details close once the brand marks payment sent",
      (await act(brandT, dealA, "markAdvanceSent")).status === 200 &&
        (await view(dealA, "ADVANCE")).status === 409,
    );
    check(
      "Advance details reopen if the creator says payment was not received",
      (await act(infT, dealA, "rejectAdvance")).status === 200 &&
        (await view(dealA, "ADVANCE")).status === 200,
    );

    await act(brandT, dealA, "markAdvanceSent");
    await act(infT, dealA, "confirmAdvance");
    await act(infT, dealA, "submitDraft", {
      url: "https://example.com/draft",
    });
    await act(brandT, dealA, "approveDraft");
    await act(infT, dealA, "submitLink", {
      url: "https://example.com/post",
    });
    const verified = await act(brandT, dealA, "verifyLink");
    check(
      "The deal reaches the final payment stage",
      verified.status === 200 && verified.data.status === "LINK_VERIFIED",
      show(verified),
    );
    check(
      "Advance details are unavailable at the final stage",
      (await view(dealA, "ADVANCE")).status === 409,
    );
    const finalView = await view(dealA, "FINAL");
    check(
      "Brand sees final details at the final stage",
      finalView.status === 200 &&
        finalView.data.amountDue === 250000 &&
        finalView.data.upiUri.includes("am=2500.00"),
      show(finalView),
    );

    const del = await api("/payment-details/me", {
      method: "DELETE",
      token: infT,
    });
    check("Creator can delete saved details", del.status === 200);
    check(
      "The brand cannot view details after they are deleted",
      (await view(dealA, "FINAL")).status === 404,
    );
    const finalLog = await status(dealA, infT);
    check(
      "The creator's view log remains after deleting details",
      finalLog.data.log?.some(
        (entry) => entry.event === "VIEWED" && entry.stage === "FINAL",
      ),
      show(finalLog),
    );
  } finally {
    const ids = dealIds.map(oid);
    await db.collection("payment_shares").deleteMany({ deal: { $in: ids } });
    await logsCol.deleteMany({ deal: { $in: ids } });
    await db.collection("deals").deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Script error:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
