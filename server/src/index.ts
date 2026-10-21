import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./modules/auth/auth.routes";
import profileRoutes from "./modules/profiles/profile.routes";
import pricingRoutes from "./modules/pricing/pricing.routes";
import influencerRoutes from "./modules/influencers/influencer.routes";
import chatRoutes from "./modules/chat/chat.routes";
import { initSocket } from "./socket";
import brandRoutes from "./modules/brands/brand.routes";
import dealRoutes from "./modules/deals/deal.routes";
import paymentDetailsRoutes from "./modules/payments/payment-details.routes";
import paymentShareRoutes from "./modules/payments/payment-share.routes";
import notificationRoutes from "./modules/notifications/notification.routes";
import {
  apiLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  registerLimiter,
} from "./lib/rate-limit";

// Stop at startup, with a clear message, if a setting is missing or wrong.
// Only the names are printed, never the values.
function checkSettings() {
  const problems: string[] = [];

  if (!process.env.MONGODB_URI) problems.push("MONGODB_URI is missing");
  if (!process.env.JWT_SECRET) problems.push("JWT_SECRET is missing");
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.PAYMENT_ENCRYPTION_KEY ?? "")) {
    problems.push("PAYMENT_ENCRYPTION_KEY must be 64 hex characters");
  }

  const clientUrl = process.env.CLIENT_URL;
  if (clientUrl) {
    if (!/^https?:\/\//.test(clientUrl)) {
      problems.push("CLIENT_URL must start with http:// or https://");
    }
    if (clientUrl.endsWith("/")) {
      problems.push("CLIENT_URL must not end with a slash");
    }
  } else {
    console.warn(
      "CLIENT_URL is not set, so only http://localhost:5173 can use this API.",
    );
  }

  if (problems.length > 0) {
    console.error("Cannot start:\n- " + problems.join("\n- "));
    process.exit(1);
  }
}

checkSettings();

const app = express();

// Behind a hosting proxy, set TRUST_PROXY to the number of proxies in front of
// the server, so that req.ip is the visitor's address and not the proxy's.
// On Render it is 3 (measured). Leave it unset when running on your own computer.
const proxyHops = Number(process.env.TRUST_PROXY);
if (Number.isInteger(proxyHops) && proxyHops > 0) {
  app.set("trust proxy", proxyHops);
}

// Only the real client may call the API from a browser (same rule as Socket.io)
app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rate limits (they must come before the routes they protect)
app.use("/api", apiLimiter);
app.use("/api/auth/login", loginIpLimiter, loginAccountLimiter);
app.use("/api/auth/register", registerLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/influencers", influencerRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/payment-details", paymentDetailsRoutes);
app.use("/api/payment-shares", paymentShareRoutes);
app.use("/api/notifications", notificationRoutes);

// Socket.io needs the raw HTTP server, not just the Express app
const httpServer = http.createServer(app);
initSocket(httpServer);

async function start() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("MongoDB connected");
  const port = process.env.PORT || 5000;
  httpServer.listen(port, () => console.log(`Server running on port ${port}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
