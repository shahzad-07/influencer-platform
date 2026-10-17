import { influencerFromEnv } from "./test-env.mjs";

const API = "http://localhost:5000/api";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: "password123" },
  influencer: influencerFromEnv(),
  outsider: { email: "other@test.com", password: "password123" },
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

async function expectOk(
  name,
  token,
  dealId,
  action,
  expectedStatus,
  extra = {},
) {
  const r = await act(token, dealId, action, extra);
  check(name, r.status === 200 && r.data.status === expectedStatus, show(r));
}

async function expectFail(name, token, dealId, action, code, extra = {}) {
  const r = await act(token, dealId, action, extra);
  check(name, r.status === code, show(r));
}

const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  const brandT = await login(ACCOUNTS.brand);
  const infT = await login(ACCOUNTS.influencer);
  const outT = await login(ACCOUNTS.outsider);

  const brandId = (await api("/auth/me", { token: brandT })).data.user._id;
  const infId = (await api("/auth/me", { token: infT })).data.user._id;

  const newDeal = (overrides = {}) =>
    api("/deals", {
      method: "POST",
      token: brandT,
      body: {
        influencerId: infId,
        title: "Test deal",
        brief: "Make one reel showing our new menu.",
        amount: 500000,
        advancePercent: 50,
        deadline: inAWeek,
        ...overrides,
      },
    });

  // ---- Creating deals: who and what is allowed ----
  check(
    "Logged-out visitor cannot list deals",
    (await api("/deals")).status === 401,
  );
  check(
    "Influencer cannot create a deal",
    (
      await api("/deals", {
        method: "POST",
        token: infT,
        body: { influencerId: infId },
      })
    ).status === 403,
  );
  check(
    "Empty deal is rejected",
    (await newDeal({ title: "", brief: "" })).status === 400,
  );
  check(
    "Decimal amount is rejected",
    (await newDeal({ amount: 500.5 })).status === 400,
  );
  check(
    "Deadline in the past is rejected",
    (await newDeal({ deadline: "2020-01-01T00:00:00.000Z" })).status === 400,
  );
  check(
    "Bad influencer id is rejected",
    (await newDeal({ influencerId: "abc" })).status === 400,
  );
  check(
    "A brand cannot be the target of an offer",
    (await newDeal({ influencerId: brandId })).status === 404,
  );
  check(
    "Unknown influencer is rejected",
    (await newDeal({ influencerId: "000000000000000000000000" })).status ===
      404,
  );

  // ---- Create the main deal ----
  const created = await newDeal();
  check(
    "Brand creates a deal",
    created.status === 201 && Boolean(created.data.dealId),
    show(created),
  );
  const dealId = created.data.dealId;

  // ---- Who can see it ----
  const asInf = await api(`/deals/${dealId}`, { token: infT });
  const asBrand = await api(`/deals/${dealId}`, { token: brandT });
  check(
    "Outsider cannot see the deal",
    (await api(`/deals/${dealId}`, { token: outT })).status === 404,
  );
  check(
    "Influencer sees an OFFERED deal",
    asInf.data.deal?.status === "OFFERED",
  );
  check(
    "Influencer's allowed actions are accept and decline",
    JSON.stringify(asInf.data.deal?.allowedActions) ===
      JSON.stringify(["accept", "decline"]),
    JSON.stringify(asInf.data.deal?.allowedActions),
  );
  check(
    "Brand's allowed action is cancel",
    JSON.stringify(asBrand.data.deal?.allowedActions) ===
      JSON.stringify(["cancel"]),
    JSON.stringify(asBrand.data.deal?.allowedActions),
  );
  check(
    "Payment split is 250000 + 250000 paise",
    asInf.data.deal?.payments?.advance === 250000 &&
      asInf.data.deal?.payments?.final === 250000,
  );
  await expectFail(
    "Outsider cannot act on the deal",
    outT,
    dealId,
    "accept",
    404,
  );

  // ---- Offer and advance payment ----
  await expectFail(
    "Brand cannot accept its own offer",
    brandT,
    dealId,
    "accept",
    409,
  );
  await expectOk("Influencer accepts", infT, dealId, "accept", "ACCEPTED");
  await expectFail("Accepting twice is rejected", infT, dealId, "accept", 409);
  await expectFail(
    "Influencer cannot mark the advance sent",
    infT,
    dealId,
    "markAdvanceSent",
    409,
  );
  await expectOk(
    "Brand marks the advance sent",
    brandT,
    dealId,
    "markAdvanceSent",
    "ADVANCE_SENT",
  );
  await expectFail(
    "Brand cannot confirm its own payment",
    brandT,
    dealId,
    "confirmAdvance",
    409,
  );
  await expectFail(
    "Brand cannot cancel after claiming the advance",
    brandT,
    dealId,
    "cancel",
    409,
  );
  await expectOk(
    "Influencer says 'not received'",
    infT,
    dealId,
    "rejectAdvance",
    "ACCEPTED",
  );
  await expectOk(
    "Brand marks the advance sent again",
    brandT,
    dealId,
    "markAdvanceSent",
    "ADVANCE_SENT",
  );
  await expectOk(
    "Influencer confirms the advance",
    infT,
    dealId,
    "confirmAdvance",
    "IN_PROGRESS",
  );

  // ---- Draft rounds ----
  await expectFail("Draft needs a link", infT, dealId, "submitDraft", 400);
  await expectFail(
    "Draft link must be http(s)",
    infT,
    dealId,
    "submitDraft",
    400,
    { url: "javascript:alert(1)" },
  );
  await expectOk(
    "Influencer submits a draft",
    infT,
    dealId,
    "submitDraft",
    "DRAFT_SUBMITTED",
    {
      url: "https://drive.example.com/draft-1",
    },
  );
  await expectFail(
    "Influencer cannot approve their own draft",
    infT,
    dealId,
    "approveDraft",
    409,
  );
  await expectFail(
    "Requesting changes needs a comment",
    brandT,
    dealId,
    "requestChanges",
    400,
  );
  await expectOk(
    "Brand requests changes with a comment",
    brandT,
    dealId,
    "requestChanges",
    "CHANGES_REQUESTED",
    {
      note: "Please add our logo in the first 3 seconds.",
    },
  );
  await expectOk(
    "Influencer submits a second draft",
    infT,
    dealId,
    "submitDraft",
    "DRAFT_SUBMITTED",
    {
      url: "https://drive.example.com/draft-2",
    },
  );
  await expectOk(
    "Brand approves the draft",
    brandT,
    dealId,
    "approveDraft",
    "DRAFT_APPROVED",
  );

  // ---- Posted link ----
  await expectOk(
    "Influencer submits the posted link",
    infT,
    dealId,
    "submitLink",
    "LINK_SUBMITTED",
    {
      url: "https://instagram.com/p/abc123",
    },
  );
  await expectFail(
    "Rejecting a link needs a comment",
    brandT,
    dealId,
    "rejectLink",
    400,
  );
  await expectOk(
    "Brand rejects the link with a comment",
    brandT,
    dealId,
    "rejectLink",
    "DRAFT_APPROVED",
    {
      note: "That post is private. Please make it public.",
    },
  );
  await expectOk(
    "Influencer submits the link again",
    infT,
    dealId,
    "submitLink",
    "LINK_SUBMITTED",
    {
      url: "https://instagram.com/p/abc123",
    },
  );
  await expectOk(
    "Brand verifies the link",
    brandT,
    dealId,
    "verifyLink",
    "LINK_VERIFIED",
  );

  // ---- Final payment ----
  await expectOk(
    "Brand marks the final payment sent",
    brandT,
    dealId,
    "markFinalSent",
    "FINAL_SENT",
  );
  await expectOk(
    "Influencer says the final was 'not received'",
    infT,
    dealId,
    "rejectFinal",
    "LINK_VERIFIED",
  );
  await expectOk(
    "Brand marks the final sent again",
    brandT,
    dealId,
    "markFinalSent",
    "FINAL_SENT",
  );
  await expectOk(
    "Influencer confirms the final",
    infT,
    dealId,
    "confirmFinal",
    "COMPLETED",
  );

  // ---- After completion ----
  await expectFail(
    "A completed deal cannot change",
    brandT,
    dealId,
    "verifyLink",
    409,
  );
  const done = await api(`/deals/${dealId}`, { token: infT });
  check(
    "Completed deal has no allowed actions",
    done.data.deal?.allowedActions?.length === 0,
  );
  check(
    "History recorded every step (18 entries)",
    done.data.deal?.statusHistory?.length === 18,
    String(done.data.deal?.statusHistory?.length),
  );
  check(
    "The brand's change request is saved in the history",
    done.data.deal?.statusHistory?.some(
      (h) => h.status === "CHANGES_REQUESTED" && h.note.includes("logo"),
    ),
  );
  check(
    "Draft and post links are saved",
    done.data.deal?.draftUrl?.endsWith("draft-2") &&
      done.data.deal?.postUrl?.includes("abc123"),
  );

  // ---- Lists ----
  const brandList = await api("/deals", { token: brandT });
  const infList = await api("/deals", { token: infT });
  const outList = await api("/deals", { token: outT });
  check(
    "Brand's list contains the deal",
    brandList.data.deals?.some((d) => d.id === dealId),
  );
  check(
    "Influencer's list contains the deal",
    infList.data.deals?.some((d) => d.id === dealId),
  );
  check(
    "Outsider's list does not contain the deal",
    !outList.data.deals?.some((d) => d.id === dealId),
  );

  // ---- Two simultaneous clicks: exactly one should win ----
  const race = (await newDeal({ title: "Race test" })).data.dealId;
  const [a, b] = await Promise.all([
    act(infT, race, "accept"),
    act(infT, race, "accept"),
  ]);
  const codes = [a.status, b.status].sort();
  check(
    "Two simultaneous accepts: exactly one wins",
    codes[0] === 200 && codes[1] === 409,
    codes.join(", "),
  );

  // ---- Cancel ----
  const toCancel = (await newDeal({ title: "Cancel test" })).data.dealId;
  await expectOk(
    "Brand cancels an unanswered offer",
    brandT,
    toCancel,
    "cancel",
    "CANCELLED",
  );
  await expectFail(
    "Cannot accept a cancelled offer",
    infT,
    toCancel,
    "accept",
    409,
  );

  // ---- Dispute ----
  const toDispute = (await newDeal({ title: "Dispute test" })).data.dealId;
  await expectOk(
    "Dispute setup: influencer accepts",
    infT,
    toDispute,
    "accept",
    "ACCEPTED",
  );
  await expectFail(
    "Cannot dispute before any money is involved",
    brandT,
    toDispute,
    "dispute",
    409,
    { note: "x" },
  );
  await expectOk(
    "Dispute setup: brand marks the advance sent",
    brandT,
    toDispute,
    "markAdvanceSent",
    "ADVANCE_SENT",
  );
  await expectFail(
    "A dispute needs a comment",
    infT,
    toDispute,
    "dispute",
    400,
  );
  await expectOk(
    "Influencer raises a dispute with a comment",
    infT,
    toDispute,
    "dispute",
    "DISPUTED",
    {
      note: "Only half the advance arrived.",
    },
  );
  await expectFail(
    "A disputed deal is frozen",
    infT,
    toDispute,
    "confirmAdvance",
    409,
  );

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
