import { influencerFromEnv } from "./test-env.mjs";

const API = "http://localhost:5000/api";
const PASSWORD = "password123";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: PASSWORD },
  influencer: influencerFromEnv(),
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
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function login({ email, password }) {
  const { data } = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!data.token)
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

const act = (token, dealId, action, extra = {}) =>
  api(`/deals/${dealId}/actions`, {
    method: "POST",
    token,
    body: { action, ...extra },
  });

async function main() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok)
    throw new Error(
      "The server is not responding on port 5000. Start it with npm run dev first.",
    );

  const brandT = await login(ACCOUNTS.brand);
  const infT = await login(ACCOUNTS.influencer);
  const infId = (await api("/auth/me", { token: infT })).data.user._id;

  const stamp = Date.now();
  const make = (overrides = {}) =>
    api("/deals", {
      method: "POST",
      token: brandT,
      body: {
        influencerId: infId,
        title: "Collaboration type test",
        brief: "Test brief for the collaboration type checks.",
        ...overrides,
      },
    });
  const getDeal = async (dealId, token = brandT) =>
    (await api(`/deals/${dealId}`, { token })).data.deal;

  // ---- Input rules for each type ----
  const bad = async (name, body) =>
    check(name, (await make(body)).status === 400);
  await bad("Paid with no amount is rejected", { collaborationType: "PAID" });
  await bad("Paid with an amount under Rs 1 is rejected", {
    collaborationType: "PAID",
    amount: 50,
    advancePercent: 50,
  });
  await bad("Paid with a 0% advance is rejected", {
    collaborationType: "PAID",
    amount: 500000,
    advancePercent: 0,
  });
  await bad("Paid with a 100% advance is rejected", {
    collaborationType: "PAID",
    amount: 500000,
    advancePercent: 100,
  });
  await bad("Barter with no description is rejected", {
    collaborationType: "BARTER",
  });
  await bad("Barter with a too-short description is rejected", {
    collaborationType: "BARTER",
    barterDescription: "Hi",
  });
  await bad("Paid and barter with no description is rejected", {
    collaborationType: "PAID_AND_BARTER",
    amount: 500000,
    advancePercent: 50,
  });
  await bad("Paid and barter with no amount is rejected", {
    collaborationType: "PAID_AND_BARTER",
    barterDescription: "Dinner for two",
  });
  await bad("Unknown collaboration type is rejected", {
    collaborationType: "FREE",
  });

  // ---- A deal without a type is paid, as before ----
  const plain = await make({ amount: 500000, advancePercent: 50 });
  check("A deal with no type still works", plain.status === 201, show(plain));
  const plainDeal = await getDeal(plain.data.dealId);
  check(
    "It defaults to PAID",
    plainDeal.collaborationType === "PAID",
    plainDeal.collaborationType,
  );
  check(
    "A paid deal ignores a barter description",
    (
      await getDeal(
        (await make({ amount: 500000, barterDescription: "Ignored text" })).data
          .dealId,
      )
    ).barterDescription === "",
  );

  // ---- Barter only ----
  const created = await make({
    collaborationType: "BARTER",
    barterDescription: "Dinner for two worth Rs 3000 and a free dessert",
    amount: 999999, // must be ignored
    advancePercent: 40, // must be ignored
  });
  check("A barter deal is created", created.status === 201, show(created));
  const barterId = created.data.dealId;

  let deal = await getDeal(barterId, infT);
  check(
    "The type and description are saved",
    deal.collaborationType === "BARTER" &&
      deal.barterDescription.includes("Dinner for two"),
    JSON.stringify(deal),
  );
  check(
    "The money is forced to zero",
    deal.amount === 0 && deal.advancePercent === 0,
    `${deal.amount} / ${deal.advancePercent}`,
  );
  check(
    "Advance and final are both zero",
    deal.payments.advance === 0 && deal.payments.final === 0,
  );
  check(
    "The influencer can accept or decline",
    ["accept", "decline"].every((a) => deal.allowedActions.includes(a)),
    JSON.stringify(deal.allowedActions),
  );

  const list = await api("/deals", { token: brandT });
  check(
    "The deals list shows the type",
    list.data.deals?.find((d) => d.id === barterId)?.collaborationType ===
      "BARTER",
  );

  const accepted = await act(infT, barterId, "accept");
  check(
    "Accepting a barter deal goes straight to IN_PROGRESS",
    accepted.status === 200 && accepted.data.status === "IN_PROGRESS",
    show(accepted),
  );

  deal = await getDeal(barterId, infT);
  check(
    "There are no payment steps to offer",
    !deal.allowedActions.some((a) => /Advance|Final/.test(a)),
    JSON.stringify(deal.allowedActions),
  );
  check(
    "The influencer can submit a draft",
    deal.allowedActions.includes("submitDraft"),
  );

  check(
    "The brand cannot claim an advance",
    (
      await act(brandT, barterId, "markAdvanceSent", {
        reference: `UTR${stamp}A`,
      })
    ).status === 409,
  );
  check(
    "The influencer cannot confirm an advance",
    (await act(infT, barterId, "confirmAdvance")).status === 409,
  );
  check(
    "The brand cannot cancel after acceptance",
    (await act(brandT, barterId, "cancel")).status === 409,
  );

  const shareTry = await api("/payment-shares", {
    method: "POST",
    token: infT,
    body: { dealId: barterId, stage: "ADVANCE" },
  });
  check(
    "Payment details cannot be shared on a barter deal",
    shareTry.status === 409,
    show(shareTry),
  );

  check(
    "Influencer submits a draft",
    (
      await act(infT, barterId, "submitDraft", {
        url: "https://example.com/draft",
      })
    ).status === 200,
  );
  check(
    "Brand approves the draft",
    (await act(brandT, barterId, "approveDraft")).status === 200,
  );
  check(
    "Influencer submits the post link",
    (
      await act(infT, barterId, "submitLink", {
        url: "https://example.com/post",
      })
    ).status === 200,
  );

  const verified = await act(brandT, barterId, "verifyLink");
  check(
    "Verifying the link completes a barter deal",
    verified.status === 200 && verified.data.status === "COMPLETED",
    show(verified),
  );

  deal = await getDeal(barterId, brandT);
  check(
    "A completed barter deal has no payment records and nothing paid",
    deal.paymentRecords.length === 0 && deal.paidTotal === 0,
  );
  check(
    "A completed barter deal has no actions left",
    deal.allowedActions.length === 0,
    JSON.stringify(deal.allowedActions),
  );
  check(
    "The timeline shows accepted, draft, approved, link, and completed",
    deal.statusHistory.length === 6,
    String(deal.statusHistory.length),
  );

  // ---- Paid and barter together ----
  const both = await make({
    collaborationType: "PAID_AND_BARTER",
    barterDescription: "Free tasting menu for the shoot",
    amount: 400000,
    advancePercent: 50,
  });
  check("A paid-and-barter deal is created", both.status === 201, show(both));
  const bothId = both.data.dealId;
  deal = await getDeal(bothId, infT);
  check(
    "It keeps the money and the barter description",
    deal.amount === 400000 &&
      deal.payments.advance === 200000 &&
      deal.barterDescription.includes("tasting"),
    JSON.stringify(deal),
  );

  const acceptedBoth = await act(infT, bothId, "accept");
  check(
    "Accepting goes to ACCEPTED, because an advance is due",
    acceptedBoth.status === 200 && acceptedBoth.data.status === "ACCEPTED",
    show(acceptedBoth),
  );
  deal = await getDeal(bothId, brandT);
  check(
    "The brand can now claim the advance",
    deal.allowedActions.includes("markAdvanceSent"),
    JSON.stringify(deal.allowedActions),
  );

  const sent = await act(brandT, bothId, "markAdvanceSent", {
    reference: `UTR${stamp}B`,
  });
  check(
    "The advance claim works as usual",
    sent.status === 200 && sent.data.status === "ADVANCE_SENT",
    show(sent),
  );
  check(
    "The influencer confirms it",
    (await act(infT, bothId, "confirmAdvance")).data.status === "IN_PROGRESS",
  );
  deal = await getDeal(bothId, brandT);
  check(
    "The payment is recorded",
    deal.paymentRecords.length === 1 && deal.paidTotal === 200000,
  );

  // ---- The brand can still cancel an unanswered barter offer ----
  const cancelMe = await make({
    collaborationType: "BARTER",
    barterDescription: "A free product bundle",
  });
  const cancelled = await act(brandT, cancelMe.data.dealId, "cancel");
  check(
    "The brand can cancel an unanswered barter offer",
    cancelled.status === 200 && cancelled.data.status === "CANCELLED",
    show(cancelled),
  );

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
