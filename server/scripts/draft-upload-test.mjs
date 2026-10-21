import "dotenv/config";
import jwt from "jsonwebtoken";

const API = "http://localhost:5000/api";
const dealId = "68f000000000000000000001";
const userId = "68f000000000000000000002";
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is missing from server/.env");

let failed = false;
function check(name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` -> ${detail}` : ""}`);
}

async function request(body, role = "INFLUENCER") {
  const token = jwt.sign({ userId, role }, secret);
  const response = await fetch(`${API}/deals/${dealId}/draft-uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return response.status;
}

const health = await fetch(`${API}/health`).catch(() => null);
if (!health?.ok) {
  throw new Error("Start the local server with npm run dev before this test");
}

const noToken = await fetch(`${API}/deals/${dealId}/draft-uploads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fileName: "draft.mp4",
    contentType: "video/mp4",
    sizeBytes: 100,
  }),
});
check("unauthenticated upload signing is rejected", noToken.status === 401);
check(
  "brands cannot request creator upload signatures",
  (await request({ fileName: "draft.mp4", contentType: "video/mp4", sizeBytes: 100 }, "BRAND")) === 403,
);
check(
  "non-video types are rejected before storage access",
  (await request({ fileName: "draft.txt", contentType: "text/plain", sizeBytes: 100 })) === 400,
);
check(
  "files larger than 1 MB are rejected before storage access",
  (await request({ fileName: "draft.mp4", contentType: "video/mp4", sizeBytes: 1024 * 1024 + 1 })) === 400,
);
check(
  "the file extension must match its video type",
  (await request({ fileName: "draft.txt", contentType: "video/mp4", sizeBytes: 100 })) === 400,
);

if (failed) {
  console.error("\nSome checks FAILED");
  process.exitCode = 1;
} else {
  console.log("\nAll draft-upload authorization and limit checks passed");
}
