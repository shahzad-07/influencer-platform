import type { Request, Response } from "express";
import {
  createRateLimiter,
  apiLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  registerLimiter,
} from "../src/lib/rate-limit";

type Limiter = ReturnType<typeof createRateLimiter>;

let failed = false;
const check = (name: string, ok: boolean) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A pretend response that records what the limiter does to it
function fakeRes() {
  let onClose: (() => void) | null = null;
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    set(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    once(event: string, fn: () => void) {
      if (event === "close") onClose = fn;
      return this;
    },
    // The request ends with this status (the server has answered)
    finish(code: number) {
      this.statusCode = code;
      onClose?.();
    },
  };
}

// Send one pretend request through a limiter.
// By default an allowed request ends right away with `status`.
// With hold: true it stays "in progress" until you call res.finish(...).
function hit(
  limiter: Limiter,
  opts: { ip?: string; body?: unknown; status?: number; hold?: boolean } = {},
) {
  const req = {
    ip: opts.ip ?? "1.1.1.1",
    body: opts.body,
  } as unknown as Request;
  const res = fakeRes();
  const state = { allowed: false };
  limiter(req, res as unknown as Response, () => {
    state.allowed = true;
  });
  if (state.allowed && !opts.hold) res.finish(opts.status ?? 200);
  return { allowed: state.allowed, res };
}

async function main() {
  // 1. The basic limit
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 3,
      message: "Slow down.",
    });
    const r = [1, 2, 3, 4].map(() => hit(limiter));
    check(
      "The first 3 requests are allowed",
      r.slice(0, 3).every((x) => x.allowed),
    );
    check(
      "The 4th request is blocked with status 429",
      !r[3].allowed && r[3].res.statusCode === 429,
    );
    const msg = (r[3].res.body as { message?: string }).message ?? "";
    check(
      "The blocked reply says how long to wait",
      msg.startsWith("Slow down.") && msg.includes("Try again in"),
    );
    check(
      "The blocked reply has a Retry-After header",
      Number(r[3].res.headers["Retry-After"]) > 0,
    );
  }

  // 2. Different people are counted separately
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 1,
      message: "No.",
    });
    hit(limiter, { ip: "2.2.2.1" });
    check(
      "A second request from the same address is blocked",
      !hit(limiter, { ip: "2.2.2.1" }).allowed,
    );
    check(
      "A different address is not affected",
      hit(limiter, { ip: "2.2.2.2" }).allowed,
    );
  }

  // 3. The counting period ends and people can try again
  {
    const limiter = createRateLimiter({
      windowMs: 60,
      limit: 1,
      message: "No.",
    });
    const first = hit(limiter);
    const second = hit(limiter);
    await sleep(100);
    const third = hit(limiter);
    check(
      "Blocked, then allowed again once the period is over",
      first.allowed && !second.allowed && third.allowed,
    );
  }

  // 4. Failure counting: only errors count
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 3,
      count: "failures",
      message: "No.",
    });
    const wins = Array.from({ length: 10 }, () =>
      hit(limiter, { status: 200 }),
    );
    check(
      "10 successful requests in a row are never blocked",
      wins.every((x) => x.allowed),
    );
    const fails = [1, 2, 3].map(() => hit(limiter, { status: 401 }));
    check(
      "3 failed requests are allowed",
      fails.every((x) => x.allowed),
    );
    check(
      "The next request is blocked after 3 failures",
      !hit(limiter, { status: 200 }).allowed,
    );
  }

  // 5. A success in between does not reset the failures
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 3,
      count: "failures",
      message: "No.",
    });
    hit(limiter, { status: 401 });
    hit(limiter, { status: 401 });
    hit(limiter, { status: 200 });
    const third = hit(limiter, { status: 401 });
    check("The 3rd failure is still allowed after a success", third.allowed);
    check(
      "A success in between does not reset the failures",
      !hit(limiter, { status: 200 }).allowed,
    );
  }

  // 6. A burst of parallel attempts cannot get past the limit
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 3,
      count: "failures",
      message: "No.",
    });
    const burst = Array.from({ length: 10 }, () =>
      hit(limiter, { hold: true }),
    );
    const through = burst.filter((x) => x.allowed);
    check(
      "A burst of 10 attempts at the same moment lets only 3 through",
      through.length === 3,
    );
    through.forEach((x) => x.res.finish(401));
    check(
      "After those 3 fail, the next attempt is blocked",
      !hit(limiter).allowed,
    );
  }

  // 7. A request that succeeds frees its place
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 1,
      count: "failures",
      message: "No.",
    });
    const a = hit(limiter, { hold: true });
    const b = hit(limiter);
    a.res.finish(200);
    const c = hit(limiter);
    check(
      "While one is in progress the next waits, then succeeds are not counted",
      a.allowed && !b.allowed && c.allowed,
    );
  }

  // 8. The testing switch
  {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 1,
      message: "No.",
    });
    process.env.RATE_LIMIT_OFF = "1";
    const off = Array.from({ length: 5 }, () => hit(limiter));
    delete process.env.RATE_LIMIT_OFF;
    check(
      "RATE_LIMIT_OFF=1 lets everything through",
      off.every((x) => x.allowed),
    );
    const first = hit(limiter);
    const second = hit(limiter);
    check(
      "With the switch off again, limits work as normal",
      first.allowed && !second.allowed,
    );
  }

  // 9. The real login limit: 5 failures per account per connection
  {
    const ip = "10.0.0.1";
    const login = (email: string, from = ip) =>
      hit(loginAccountLimiter, { ip: from, body: { email }, status: 401 });

    const five = ["A@x.com", "a@x.com", "A@X.com", " a@x.com ", "a@x.com"].map(
      (e) => login(e),
    );
    check(
      "5 failed logins for one account are all allowed",
      five.every((x) => x.allowed),
    );
    check(
      "The 6th is blocked, even with different capital letters or spaces",
      !login("A@x.com").allowed,
    );
    check(
      "The same account from another connection is not blocked",
      login("a@x.com", "10.0.0.2").allowed,
    );
    check(
      "A different account from the same connection is not blocked",
      login("b@x.com").allowed,
    );

    const wins = Array.from({ length: 20 }, () =>
      hit(loginAccountLimiter, {
        ip: "10.0.0.3",
        body: { email: "ok@x.com" },
        status: 200,
      }),
    );
    check(
      "20 successful logins in a row are never blocked",
      wins.every((x) => x.allowed),
    );
    check(
      "A login request with no body does not crash",
      hit(loginAccountLimiter, { ip: "10.0.0.4", status: 400 }).allowed,
    );
  }

  // 10. The real per-connection login limit: 50 failures
  {
    const fails = Array.from({ length: 50 }, () =>
      hit(loginIpLimiter, { ip: "10.0.1.1", status: 401 }),
    );
    check(
      "50 failed logins from one connection are allowed",
      fails.every((x) => x.allowed),
    );
    check(
      "The 51st is blocked",
      !hit(loginIpLimiter, { ip: "10.0.1.1", status: 401 }).allowed,
    );
  }

  // 11. The real sign-up limit: 10 per hour per connection
  {
    const made = Array.from({ length: 10 }, () =>
      hit(registerLimiter, { ip: "10.0.2.1", status: 201 }),
    );
    check(
      "10 sign-ups from one connection are allowed",
      made.every((x) => x.allowed),
    );
    check(
      "The 11th sign-up is blocked",
      !hit(registerLimiter, { ip: "10.0.2.1", status: 201 }).allowed,
    );
  }

  // 12. The real general limit: 300 per minute
  {
    const many = Array.from({ length: 300 }, () =>
      hit(apiLimiter, { ip: "10.0.3.1" }),
    );
    check(
      "300 requests in a minute are allowed",
      many.every((x) => x.allowed),
    );
    check("The 301st is blocked", !hit(apiLimiter, { ip: "10.0.3.1" }).allowed);
  }

  console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
