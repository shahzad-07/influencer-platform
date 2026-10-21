import { influencerFromEnv } from "./test-env.mjs";

const API = "http://localhost:5000/api";
const PASSWORD = "password123";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: PASSWORD },
  influencer: influencerFromEnv(),
  outsider: { email: "other@test.com", password: PASSWORD },
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
  const outT = await login(ACCOUNTS.outsider);
  const infId = (await api("/auth/me", { token: infT })).data.user._id;

  const stamp = Date.now();
  const ref = (n) => `UTR${stamp}${n}`; // unique, alphanumeric

  const newDeal = (overrides = {}) =>
    api("/deals", {
      method: "POST",
      token: brandT,
      body: {
        influencerId: infId,
        title: "Payment records test",
        brief: "Test brief for the payment record checks.",
        amount: 1000001, // Rs 10,000.01: the split is not an even number
        advancePercent: 30,
        ...overrides,
      },
    });
  const getDeal = async (dealId, token = brandT) =>
    (await api(`/deals/${dealId}`, { token })).data.deal;

  // ---- Deal setup rules ----
  check(
    "0% advance is rejected",
    (await newDeal({ advancePercent: 0 })).status === 400,
  );
  check(
    "100% advance is rejected",
    (await newDeal({ advancePercent: 100 })).status === 400,
  );

  const created = await newDeal();
  check(
    "Deal with a 30% advance is created",
    created.status === 201,
    show(created),
  );
  const dealId = created.data.dealId;
  check(
    "Influencer accepts",
    (await act(infT, dealId, "accept")).status === 200,
  );

  // ---- A reference is optional, but if given it must look right ----
  for (const [label, bad] of [
    ["too short", "123"],
    ["with spaces", "bad ref 123"],
    ["with symbols", "ref#12345!"],
    ["too long", "A".repeat(31)],
  ]) {
    const r = await act(brandT, dealId, "markAdvanceSent", { reference: bad });
    check(
      `A reference that is ${label} is rejected`,
      r.status === 400,
      show(r),
    );
  }
  check(
    "The deal is still waiting after bad attempts",
    (await getDeal(dealId)).status === "ACCEPTED",
  );

  // ---- First attempt: brand claims it, influencer says 'not received' ----
  const first = await act(brandT, dealId, "markAdvanceSent", {
    reference: ref(1),
  });
  check(
    "Brand claims the advance with a reference",
    first.status === 200 && first.data.status === "ADVANCE_SENT",
    show(first),
  );

  let deal = await getDeal(dealId, infT);
  const p1 = deal.paymentRecords?.[0];
  check(
    "A payment record exists",
    deal.paymentRecords?.length === 1,
    JSON.stringify(deal.paymentRecords),
  );
  check(
    "Advance amount is 30% of the deal: 300000 paise",
    p1?.stage === "ADVANCE" && p1?.amount === 300000,
    JSON.stringify(p1),
  );
  check(
    "The reference and status are recorded",
    p1?.reference === ref(1) && p1?.status === "SENT",
  );
  check("Nothing counts as paid until confirmed", deal.paidTotal === 0);
  check(
    "The brand sees the same record",
    (await getDeal(dealId, brandT)).paymentRecords?.[0]?.reference === ref(1),
  );
  check(
    "An outsider cannot see the deal or its payments",
    (await api(`/deals/${dealId}`, { token: outT })).status === 404,
  );

  const rejected = await act(infT, dealId, "rejectAdvance", {
    note: "Only half of it arrived",
  });
  check(
    "Influencer says 'not received', with a note",
    rejected.status === 200 && rejected.data.status === "ACCEPTED",
    show(rejected),
  );
  deal = await getDeal(dealId);
  check(
    "The record is marked REJECTED with the note and a time",
    deal.paymentRecords?.[0]?.status === "REJECTED" &&
      deal.paymentRecords?.[0]?.note === "Only half of it arrived" &&
      Boolean(deal.paymentRecords?.[0]?.resolvedAt),
    JSON.stringify(deal.paymentRecords?.[0]),
  );

  // ---- Reusing a reference ----
  const reuse = await act(brandT, dealId, "markAdvanceSent", {
    reference: ref(1).toLowerCase(),
  });
  check(
    "A reference cannot be reused on the same deal (even in lowercase)",
    reuse.status === 409,
    show(reuse),
  );

  // ---- Second attempt: the amount cannot be changed by the brand ----
  const second = await act(brandT, dealId, "markAdvanceSent", {
    reference: ref(2),
    amount: 1,
  });
  check("Second attempt works", second.status === 200, show(second));
  deal = await getDeal(dealId);
  check(
    "Both attempts are kept, in order",
    deal.paymentRecords?.length === 2 &&
      deal.paymentRecords[1].reference === ref(2),
  );
  check(
    "The brand's own amount was ignored (still 300000)",
    deal.paymentRecords?.[1]?.amount === 300000,
    JSON.stringify(deal.paymentRecords?.[1]),
  );
  check(
    "A brand cannot confirm its own payment",
    (await act(brandT, dealId, "confirmAdvance")).status === 409,
  );

  const confirmed = await act(infT, dealId, "confirmAdvance");
  check(
    "Influencer confirms the advance",
    confirmed.status === 200 && confirmed.data.status === "IN_PROGRESS",
    show(confirmed),
  );
  deal = await getDeal(dealId);
  check(
    "The second record is CONFIRMED and the first stays REJECTED",
    deal.paymentRecords?.[1]?.status === "CONFIRMED" &&
      deal.paymentRecords?.[0]?.status === "REJECTED",
  );
  check(
    "Paid total is 300000",
    deal.paidTotal === 300000,
    String(deal.paidTotal),
  );

  // ---- Move to the final payment ----
  await act(infT, dealId, "submitDraft", { url: "https://example.com/draft" });
  await act(brandT, dealId, "approveDraft");
  await act(infT, dealId, "submitLink", { url: "https://example.com/post" });
  const verified = await act(brandT, dealId, "verifyLink");
  check(
    "The deal reaches the final payment stage",
    verified.data.status === "LINK_VERIFIED",
    show(verified),
  );

  const reuseAdvanceRef = await act(brandT, dealId, "markFinalSent", {
    reference: ref(2),
  });
  check(
    "The advance reference cannot be reused for the final payment",
    reuseAdvanceRef.status === 409,
    show(reuseAdvanceRef),
  );
  check(
    "The deal stayed at LINK_VERIFIED",
    (await getDeal(dealId)).status === "LINK_VERIFIED",
  );

  // The reference is optional: claim the final payment without one
  const finalSent = await act(brandT, dealId, "markFinalSent");
  check(
    "Brand claims the final payment without a reference",
    finalSent.status === 200 && finalSent.data.status === "FINAL_SENT",
    show(finalSent),
  );
  deal = await getDeal(dealId);
  const pf = deal.paymentRecords?.[2];
  check(
    "Final amount is the rest: 700001 paise",
    pf?.stage === "FINAL" && pf?.amount === 700001,
    JSON.stringify(pf),
  );
  check(
    "A payment claimed without a reference is stored with an empty one",
    pf?.reference === "",
    JSON.stringify(pf),
  );
  check(
    "Advance and final add up to the deal amount",
    300000 + pf?.amount === deal.amount,
  );

  const finalConfirmed = await act(infT, dealId, "confirmFinal");
  check(
    "Influencer confirms the final payment",
    finalConfirmed.status === 200 && finalConfirmed.data.status === "COMPLETED",
    show(finalConfirmed),
  );
  deal = await getDeal(dealId);
  check(
    "Paid total equals the full deal amount",
    deal.paidTotal === 1000001,
    String(deal.paidTotal),
  );
  check("Three records in total", deal.paymentRecords?.length === 3);
  check(
    "The records cannot be changed after completion",
    (await act(infT, dealId, "confirmFinal")).status === 409,
  );

  // ---- The attempt limit ----
  const limitDeal = (
    await newDeal({
      title: "Attempt limit test",
      amount: 500000,
      advancePercent: 50,
    })
  ).data.dealId;
  await act(infT, limitDeal, "accept");
  // Attempts 1 and 2 have no reference (omitted, then an empty string), so
  // empty references must not count as "already used"
  for (let i = 1; i <= 5; i++) {
    const extra =
      i === 1 ? {} : i === 2 ? { reference: "" } : { reference: ref(`L${i}`) };
    const r = await act(brandT, limitDeal, "markAdvanceSent", extra);
    check(
      `Attempt ${i} on the limit deal is accepted`,
      r.status === 200,
      show(r),
    );
    await act(infT, limitDeal, "rejectAdvance");
  }
  const sixth = await act(brandT, limitDeal, "markAdvanceSent", {
    reference: ref("L6"),
  });
  check(
    "A sixth attempt for the same stage is refused",
    sixth.status === 409 && /too many/i.test(sixth.data.message ?? ""),
    show(sixth),
  );
  const cancelled = await act(brandT, limitDeal, "cancel");
  check(
    "The brand can still cancel the stuck deal",
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
