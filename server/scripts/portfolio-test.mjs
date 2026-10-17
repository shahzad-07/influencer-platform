import { influencerFromEnv } from "./test-env.mjs";

const API = "http://localhost:5000/api";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: "password123" },
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

async function main() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      "The server is not responding on port 5000. Start it with npm run dev first.",
    );
  }

  const infT = await login(ACCOUNTS.influencer);
  const brandT = await login(ACCOUNTS.brand);
  const infId = (await api("/auth/me", { token: infT })).data.user._id;

  // Remember the current bio so the script can put it back at the end
  const before = await api("/profiles/me", { token: infT });
  const originalBio = before.data.profile?.bio ?? "";

  const goodItems = [
    {
      title: "Cafe launch reel",
      platform: "INSTAGRAM",
      url: "https://instagram.com/reel/abc123",
      summary: "Reel for a new cafe opening. 120K views.",
    },
    {
      title: "Phone review",
      platform: "YOUTUBE",
      url: "https://youtube.com/watch?v=xyz789",
      summary: "8 minute review video.",
    },
  ];

  const save = (body, token = infT) =>
    api("/profiles/me", { method: "PUT", token, body });

  // 1. Save a portfolio
  const saved = await save({ portfolio: goodItems });
  check(
    "Influencer saves a portfolio of 2 items",
    saved.status === 200 && saved.data.profile?.portfolio?.length === 2,
    show(saved),
  );

  // 2. Read it back
  const mine = await api("/profiles/me", { token: infT });
  check(
    "Portfolio is returned on my profile",
    mine.data.profile?.portfolio?.[0]?.title === "Cafe launch reel",
    show(mine),
  );

  // 3. A brand can see it, and nothing private
  const seen = await api(`/influencers/${infId}`, { token: brandT });
  const seenText = JSON.stringify(seen.data);
  check(
    "Brand sees the portfolio on the influencer page",
    seen.data.influencer?.portfolio?.length === 2,
    show(seen),
  );
  check(
    "No email or password data in that response",
    !seenText.includes('"email"') && !seenText.includes("passwordHash"),
  );

  // 4. Saving other fields must not wipe the portfolio
  const bioOnly = await save({ bio: "Portfolio test bio" });
  check(
    "Saving only the bio keeps the portfolio",
    bioOnly.status === 200 && bioOnly.data.profile?.portfolio?.length === 2,
    show(bioOnly),
  );

  // 5. Bad input is rejected
  const bad = (name, body) =>
    save(body).then((r) => check(name, r.status === 400, show(r)));

  await bad("javascript: link is rejected", {
    portfolio: [
      { title: "Bad", platform: "OTHER", url: "javascript:alert(1)" },
    ],
  });
  await bad("ftp:// link is rejected", {
    portfolio: [
      { title: "Bad", platform: "OTHER", url: "ftp://example.com/file" },
    ],
  });
  await bad("Missing title is rejected", {
    portfolio: [{ platform: "OTHER", url: "https://example.com" }],
  });
  await bad("Unknown platform is rejected", {
    portfolio: [
      { title: "X", platform: "MYSPACE", url: "https://example.com" },
    ],
  });
  await bad("Summary over 300 characters is rejected", {
    portfolio: [
      {
        title: "X",
        platform: "OTHER",
        url: "https://example.com",
        summary: "a".repeat(301),
      },
    ],
  });
  await bad("More than 12 items is rejected", {
    portfolio: Array.from({ length: 13 }, (_, i) => ({
      title: `Item ${i + 1}`,
      platform: "OTHER",
      url: `https://example.com/${i + 1}`,
    })),
  });
  await bad("Social link must be a real web link", {
    socialLinks: [{ platform: "INSTAGRAM", url: "not-a-url" }],
  });

  // 6. Wrong role
  const asBrand = await save({ portfolio: [] }, brandT);
  check(
    "A brand cannot edit an influencer profile",
    asBrand.status === 403,
    show(asBrand),
  );

  // 7. All the failed attempts changed nothing
  const after = await api("/profiles/me", { token: infT });
  check(
    "Portfolio survived every failed attempt (still 2 items)",
    after.data.profile?.portfolio?.length === 2,
    show(after),
  );

  // 8. Clearing the portfolio works, then restore
  const cleared = await save({ portfolio: [] });
  check(
    "Sending an empty list clears the portfolio",
    cleared.status === 200 && cleared.data.profile?.portfolio?.length === 0,
    show(cleared),
  );

  await save({ bio: originalBio, portfolio: goodItems });
  console.log(
    "(Restored your original bio and left the 2 sample portfolio items in place.)",
  );

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
