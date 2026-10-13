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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/influencers", influencerRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/deals", dealRoutes);

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
