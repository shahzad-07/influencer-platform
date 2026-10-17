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

  // Remember the current values so the script can put them back at the end
  const before = await api("/profiles/me", { token: infT });
  const originalBio = before.data.profile?.bio ?? "";
  const originalLanguages = before.data.profile?.languages ?? [];

  const save = (body, token = infT) =>
    api("/profiles/me", { method: "PUT", token, body });

  // Does the brand's search for this language include our influencer?
  async function brandFinds(language) {
    for (let page = 1; page <= 10; page++) {
      const r = await api(
        `/influencers?language=${encodeURIComponent(language)}&limit=20&page=${page}`,
        { token: brandT },
      );
      if (r.status !== 200) throw new Error(`Search failed: ${show(r)}`);
      if (r.data.influencers.some((i) => i.id === infId)) return true;
      if (page * 20 >= r.data.total) break;
    }
    return false;
  }

  // 1. Save languages
  const saved = await save({ languages: ["Hindi", "English"] });
  check(
    "Influencer saves 2 languages",
    saved.status === 200 && saved.data.profile?.languages?.length === 2,
    show(saved),
  );

  // 2. Read them back
  const mine = await api("/profiles/me", { token: infT });
  check(
    "Languages are returned on my profile",
    mine.data.profile?.languages?.includes("Hindi") &&
      mine.data.profile?.languages?.includes("English"),
    show(mine),
  );

  // 3. A brand sees them on the influencer page
  const seen = await api(`/influencers/${infId}`, { token: brandT });
  check(
    "Brand sees the languages on the influencer page",
    seen.data.influencer?.languages?.length === 2,
    show(seen),
  );

  // 4. The brand-search filter
  check("Searching for Hindi finds this influencer", await brandFinds("Hindi"));
  check(
    "Searching for English finds this influencer",
    await brandFinds("English"),
  );

  const onlyHindi = await api("/influencers?language=Hindi&limit=20", {
    token: brandT,
  });
  check(
    "Every result of a Hindi search lists Hindi",
    onlyHindi.status === 200 &&
      onlyHindi.data.influencers.every((i) => i.languages.includes("Hindi")),
    show(onlyHindi),
  );

  // 5. Remove Hindi, and the Hindi search must no longer find them
  const englishOnly = await save({ languages: ["English"] });
  check(
    "Influencer changes to English only",
    englishOnly.status === 200 &&
      englishOnly.data.profile?.languages?.length === 1,
    show(englishOnly),
  );
  check(
    "Searching for Hindi no longer finds this influencer",
    !(await brandFinds("Hindi")),
  );
  check(
    "Searching for English still finds this influencer",
    await brandFinds("English"),
  );

  // 6. Repeats are removed
  const dupes = await save({ languages: ["Tamil", "Tamil", "Tamil"] });
  check(
    "The same language sent 3 times is saved once",
    dupes.status === 200 && dupes.data.profile?.languages?.length === 1,
    show(dupes),
  );

  // 7. Saving other fields must not wipe the languages
  await save({ languages: ["Hindi", "English"] });
  const bioOnly = await save({ bio: "Language test bio" });
  check(
    "Saving only the bio keeps the languages",
    bioOnly.status === 200 && bioOnly.data.profile?.languages?.length === 2,
    show(bioOnly),
  );

  // 8. Bad input is rejected
  const bad = (name, body) =>
    save(body).then((r) => check(name, r.status === 400, show(r)));

  await bad("A language that is not on the list is rejected", {
    languages: ["Klingon"],
  });
  await bad("Lowercase hindi is rejected (the list is exact)", {
    languages: ["hindi"],
  });
  await bad("More than 6 languages is rejected", {
    languages: [
      "English",
      "Hindi",
      "Urdu",
      "Bengali",
      "Telugu",
      "Marathi",
      "Tamil",
    ],
  });
  await bad("A text value instead of a list is rejected", {
    languages: "Hindi",
  });

  const badSearch = await api("/influencers?language=Klingon", {
    token: brandT,
  });
  check(
    "Searching for a language that is not on the list is rejected",
    badSearch.status === 400,
    show(badSearch),
  );

  // 9. Wrong role
  const asBrand = await save({ languages: ["Hindi"] }, brandT);
  check(
    "A brand cannot edit an influencer profile",
    asBrand.status === 403,
    show(asBrand),
  );

  // 10. All the failed attempts changed nothing
  const after = await api("/profiles/me", { token: infT });
  check(
    "Languages survived every failed attempt (still Hindi and English)",
    after.data.profile?.languages?.length === 2 &&
      after.data.profile.languages.includes("Hindi") &&
      after.data.profile.languages.includes("English"),
    show(after),
  );

  // 11. Clearing works
  const cleared = await save({ languages: [] });
  check(
    "Sending an empty list clears the languages",
    cleared.status === 200 && cleared.data.profile?.languages?.length === 0,
    show(cleared),
  );

  // Put everything back the way it was
  await save({ bio: originalBio, languages: originalLanguages });
  console.log("(Restored your original bio and languages.)");

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
