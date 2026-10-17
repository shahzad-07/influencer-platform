import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  // How long one counting period lasts
  windowMs: number;
  // How many counted requests are allowed in one period
  limit: number;
  // Shown to the person who is blocked, followed by how long to wait
  message: string;
  // What to count: every request, or only the ones that fail (status 400 and up)
  count?: "all" | "failures";
  // Who is being counted. Default: the client's IP address.
  key?: (req: Request) => string;
}

interface Entry {
  count: number; // counted requests so far
  pending: number; // failure-counting only: requests still being answered
  resetAt: number; // when this period ends (ms since 1970)
}

function waitText(seconds: number) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// Counts requests in server memory. Fine for one server. If the app ever runs
// on several servers, the counts need a shared store (like Redis) instead.
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, limit, message, count = "all" } = options;
  const keyOf = options.key ?? ((req: Request) => req.ip ?? "unknown");
  const hits = new Map<string, Entry>();

  // Forget finished periods so the map cannot grow forever
  const cleaner = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of hits) {
      if (e.resetAt <= now && e.pending === 0) hits.delete(k);
    }
  }, 60_000);
  cleaner.unref(); // never keeps the server alive on its own

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    // For local testing only: RATE_LIMIT_OFF=1 in server/.env turns limits off
    if (process.env.RATE_LIMIT_OFF === "1") return next();

    const key = keyOf(req);
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || (entry.resetAt <= now && entry.pending === 0)) {
      entry = { count: 0, pending: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    const current = entry;

    // Requests still being answered count too, so a burst of parallel
    // attempts cannot all slip in before the first failure is recorded
    if (current.count + current.pending >= limit) {
      const seconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set("Retry-After", String(seconds));
      res.status(429).json({
        message: `${message} Try again in ${waitText(seconds)}.`,
      });
      return;
    }

    if (count === "all") {
      current.count++;
    } else {
      current.pending++;
      res.once("close", () => {
        current.pending--;
        if (res.statusCode >= 400) current.count++;
      });
    }
    next();
  };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const emailOf = (req: Request) =>
  typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase().slice(0, 200)
    : "";

// Everything under /api. Generous: it only stops runaway scripts.
export const apiLimiter = createRateLimiter({
  windowMs: MINUTE,
  limit: 300,
  message: "Too many requests.",
});

// Wrong passwords for one account from one connection
export const loginAccountLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  count: "failures",
  key: (req) => `${req.ip ?? "unknown"}|${emailOf(req)}`,
  message: "Too many failed login attempts.",
});

// Wrong passwords from one connection across many accounts
export const loginIpLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 50,
  count: "failures",
  message: "Too many failed login attempts.",
});

// New accounts from one connection
export const registerLimiter = createRateLimiter({
  windowMs: HOUR,
  limit: 10,
  message: "Too many accounts were created from this connection.",
});
