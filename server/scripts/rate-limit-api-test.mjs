const API = "http://localhost:5000/api";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: "password123" },
};

let failed = false;
const check = (name, ok, extra = "") => {
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "  -> " + extra : ""}`,
  );
};
const show = (r) => `${r.status} ${JSON.stringify(r.data)}`;

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    retryAfter: res.headers.get("retry-after"),
    data: await res.json().catch(() => ({})),
  };
}

async function main() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      "The server is not responding on port 5000. Start it with npm run dev first.",
    );
  }

  // Made-up addresses, so none of your real accounts can get locked
  const stamp = Date.now();
  const fakeA = `ratelimit-a-${stamp}@example.com`;
  const fakeB = `ratelimit-b-${stamp}@example.com`;
  const wrong = (email) =>
    post("/auth/login", { email, password: "wrong-pass" });

  // 1. A normal login works
  const normal = await post("/auth/login", ACCOUNTS.brand);
  check(
    "A normal login works",
    normal.status === 200 && !!normal.data.token,
    show(normal),
  );

  // 2. Five wrong passwords for one account are answered normally
  const five = [];
  for (let i = 0; i < 5; i++) five.push(await wrong(fakeA));
  check(
    "5 wrong passwords get the normal 401 answer",
    five.every((r) => r.status === 401),
    five.map((r) => r.status).join(","),
  );

  // 3. The 6th is blocked
  const sixth = await wrong(fakeA);
  check(
    "The 6th wrong password is blocked with 429",
    sixth.status === 429,
    show(sixth),
  );
  check(
    "The blocked reply explains and says how long to wait",
    typeof sixth.data.message === "string" &&
      sixth.data.message.includes("Too many failed login attempts") &&
      sixth.data.message.includes("Try again in"),
    show(sixth),
  );
  check(
    "The blocked reply has a Retry-After time of up to 15 minutes",
    Number(sixth.retryAfter) > 0 && Number(sixth.retryAfter) <= 900,
    String(sixth.retryAfter),
  );

  // 4. It stays blocked
  const seventh = await wrong(fakeA);
  check(
    "It stays blocked on the next try",
    seventh.status === 429,
    show(seventh),
  );

  // 5. Other accounts are not affected
  const other = await wrong(fakeB);
  check(
    "A different account is not blocked (still a normal 401)",
    other.status === 401,
    show(other),
  );

  // 6. A real login still works
  const again = await post("/auth/login", ACCOUNTS.brand);
  check(
    "Your real brand account can still log in",
    again.status === 200 && !!again.data.token,
    show(again),
  );

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
