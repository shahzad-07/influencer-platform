import { io } from "socket.io-client";
import { influencerFromEnv } from "./test-env.mjs";

const API = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

const ACCOUNTS = {
  brand: { email: "brand@test.com", password: "password123" },
  influencer: influencerFromEnv(),
  outsider: { email: "other@test.com", password: "password123" },
};

let failed = false;
const check = (name, ok, extra = "") => {
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`,
  );
};

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
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

function connect(auth) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { auth, reconnection: false });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

const join = (socket, conversationId) =>
  new Promise((resolve) =>
    socket.emit("conversation:join", conversationId, resolve),
  );

const waitFor = (socket, event, ms = 3000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

async function main() {
  // 1. Connection rules
  await connect({}).then(
    () => check("Connect without token is rejected", false),
    (err) =>
      check(
        "Connect without token is rejected",
        err.message === "Not authenticated",
        err.message,
      ),
  );
  await connect({ token: "garbage" }).then(
    () => check("Connect with bad token is rejected", false),
    (err) =>
      check(
        "Connect with bad token is rejected",
        err.message === "Invalid or expired token",
        err.message,
      ),
  );

  // 2. Log in three users and connect them
  const brandToken = await login(ACCOUNTS.brand);
  const influencerToken = await login(ACCOUNTS.influencer);
  const outsiderToken = await login(ACCOUNTS.outsider);

  const brand = await connect({ token: brandToken });
  const influencer = await connect({ token: influencerToken });
  const outsider = await connect({ token: outsiderToken });
  check("Brand, influencer and outsider connect with valid tokens", true);

  // 3. Create (or fetch) the conversation
  const me = await api("/auth/me", { token: influencerToken });
  const conv = await api("/chat/conversations", {
    method: "POST",
    token: brandToken,
    body: { influencerId: me.data.user._id },
  });
  const conversationId = conv.data.conversationId;
  check("Conversation ready", Boolean(conversationId), conversationId);

  // 4. Room rules
  check(
    "Brand can join the room",
    (await join(brand, conversationId)).ok === true,
  );
  check(
    "Influencer can join the room",
    (await join(influencer, conversationId)).ok === true,
  );
  const outsiderJoin = await join(outsider, conversationId);
  check(
    "Outsider cannot join the room",
    outsiderJoin.ok === false,
    outsiderJoin.error,
  );

  // 5. Real-time delivery
  const text = `Realtime test ${Date.now()}`;
  const influencerGets = waitFor(influencer, "message:new");
  const outsiderGets = waitFor(outsider, "message:new", 1500);

  await api(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    token: brandToken,
    body: { text },
  });

  const received = await influencerGets;
  check(
    "Influencer receives the message instantly",
    received?.message?.text === text,
  );
  check("Outsider receives nothing", (await outsiderGets) === null);

  brand.close();
  influencer.close();
  outsider.close();

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
