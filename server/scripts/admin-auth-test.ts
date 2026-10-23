import type { Request, Response } from "express";
import { requireRole } from "../src/modules/auth/auth.middleware";
import type { AuthPayload, Role } from "../src/modules/auth/auth.middleware";

let failed = false;
function check(name: string, ok: boolean) {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

function checkAccess(role: Role | null) {
  let nextCalled = false;
  let statusCode = 200;
  const req = {
    user: role ? ({ userId: "test-user", role } satisfies AuthPayload) : undefined,
  } as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  requireRole("ADMIN")(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, statusCode };
}

check("ADMIN may pass admin-only middleware", checkAccess("ADMIN").nextCalled);
check(
  "BRAND is rejected by admin-only middleware",
  !checkAccess("BRAND").nextCalled && checkAccess("BRAND").statusCode === 403,
);
check(
  "INFLUENCER is rejected by admin-only middleware",
  !checkAccess("INFLUENCER").nextCalled && checkAccess("INFLUENCER").statusCode === 403,
);
check(
  "Unauthenticated requests are rejected by admin-only middleware",
  !checkAccess(null).nextCalled && checkAccess(null).statusCode === 403,
);

console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
process.exit(failed ? 1 : 0);
