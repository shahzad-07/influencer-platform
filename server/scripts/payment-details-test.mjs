import "dotenv/config";
import mongoose from "mongoose";

const API = "http://localhost:5000/api";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: "password123" },
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

async function main() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok)
    throw new Error(
      "The server is not responding on port 5000. Start it with npm run dev first.",
    );
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is missing from server/.env");

  const infT = await login(ACCOUNTS.influencer);
  const brandT = await login(ACCOUNTS.brand);
  const infId = (await api("/auth/me", { token: infT })).data.user._id;

  await mongoose.connect(process.env.MONGODB_URI);
  const rawDoc = () =>
    mongoose.connection.db
      .collection("payment_details")
      .findOne({ user: new mongoose.Types.ObjectId(infId) });

  const put = (body, token = infT) =>
    api("/payment-details/me", { method: "PUT", token, body });
  const get = (token = infT) => api("/payment-details/me", { token });

  // Start clean
  await api("/payment-details/me", { method: "DELETE", token: infT });

  // ---- Who can use it ----
  check(
    "Logged-out visitor is blocked",
    (await api("/payment-details/me")).status === 401,
  );
  check(
    "A brand cannot read payment details",
    (await get(brandT)).status === 403,
  );
  check(
    "A brand cannot save payment details",
    (await put(FAKE, brandT)).status === 403,
  );
  const empty = await get();
  check(
    "No details saved yet",
    empty.status === 200 && empty.data.details === null,
    show(empty),
  );

  // ---- Saving and reading ----
  const saved = await put(FAKE);
  check(
    "Influencer saves full details",
    saved.status === 200 && saved.data.details?.accountNumberLast4 === "9012",
    show(saved),
  );
  check(
    "Save response never contains the full account number",
    !JSON.stringify(saved.data).includes(FAKE.accountNumber),
  );
  const read = await get();
  check(
    "Details can be read back (masked)",
    read.data.details?.upiId === FAKE.upiId &&
      read.data.details?.ifsc === FAKE.ifsc &&
      read.data.details?.accountNumberLast4 === "9012",
    show(read),
  );
  check(
    "Reading back never contains the full account number",
    !JSON.stringify(read.data).includes(FAKE.accountNumber),
  );

  // ---- Encrypted in the database ----
  const raw = await rawDoc();
  const rawText = JSON.stringify(raw);
  check(
    "The database holds an encrypted value",
    typeof raw?.data === "string" && raw.data.startsWith("v1:"),
  );
  check(
    "The database contains none of the real values",
    !rawText.includes(FAKE.accountNumber) &&
      !rawText.includes(FAKE.upiId) &&
      !rawText.includes(FAKE.ifsc) &&
      !rawText.includes(FAKE.accountHolderName),
  );

  // ---- No other endpoint leaks them ----
  const targets = [
    ["my profile", await api("/profiles/me", { token: infT })],
    ["my account", await api("/auth/me", { token: infT })],
    ["my chats", await api("/chat/conversations", { token: infT })],
    ["my deals", await api("/deals", { token: infT })],
    [
      "the brand's view of the influencer",
      await api(`/influencers/${infId}`, { token: brandT }),
    ],
    [
      "the brand's view of the prices",
      await api(`/pricing/influencer/${infId}`, { token: brandT }),
    ],
    ["the brand's deals", await api("/deals", { token: brandT })],
  ];
  for (const [name, r] of targets) {
    const text = JSON.stringify(r.data);
    check(
      `No payment details appear in ${name}`,
      !text.includes(FAKE.accountNumber) && !text.includes(FAKE.upiId),
    );
  }

  // ---- Bad input is rejected ----
  const bad = async (name, body) => {
    const r = await put(body);
    check(name, r.status === 400, show(r));
  };
  await bad("Bad IFSC is rejected", { ...FAKE, ifsc: "ABC123" });
  await bad("Account number with letters is rejected", {
    ...FAKE,
    accountNumber: "12ab34cd56",
  });
  await bad("Account number that is too short is rejected", {
    ...FAKE,
    accountNumber: "12345",
  });
  await bad("Bad UPI ID is rejected", { ...FAKE, upiId: "not a upi id" });
  await bad("Missing name is rejected", { ...FAKE, accountHolderName: "" });
  await bad("Nothing to pay to is rejected", {
    accountHolderName: "Test Influencer",
  });
  await bad("Account number without an IFSC is rejected", {
    accountHolderName: "Test Influencer",
    accountNumber: "123456789012",
  });
  const unchanged = await get();
  check(
    "Failed attempts changed nothing",
    unchanged.data.details?.upiId === FAKE.upiId &&
      unchanged.data.details?.accountNumberLast4 === "9012",
    show(unchanged),
  );

  // ---- Formats and replacing ----
  const lower = await put({ ...FAKE, ifsc: "hdfc0001234" });
  check(
    "Lowercase IFSC is accepted and stored in capitals",
    lower.status === 200 && lower.data.details?.ifsc === "HDFC0001234",
    show(lower),
  );
  const upiOnly = await put({
    accountHolderName: "Test Influencer",
    upiId: "upionly@okicici",
  });
  check(
    "UPI-only details are accepted",
    upiOnly.status === 200 && upiOnly.data.details?.accountNumberLast4 === "",
    show(upiOnly),
  );
  const afterUpi = await get();
  check(
    "Saving again replaces everything (old bank details are gone)",
    afterUpi.data.details?.upiId === "upionly@okicici" &&
      afterUpi.data.details?.accountNumberLast4 === "" &&
      afterUpi.data.details?.ifsc === "",
    show(afterUpi),
  );

  // ---- Deleting ----
  check(
    "A brand cannot delete them",
    (await api("/payment-details/me", { method: "DELETE", token: brandT }))
      .status === 403,
  );
  const del = await api("/payment-details/me", {
    method: "DELETE",
    token: infT,
  });
  check("Influencer deletes the details", del.status === 200, show(del));
  check(
    "The details are gone from the API",
    (await get()).data.details === null,
  );
  check("The details are gone from the database", (await rawDoc()) === null);

  await mongoose.disconnect();
  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Script error:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
