import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
app.use(cors());
app.use(express.json());
import authRoutes from "./modules/auth/auth.routes";

app.use("/api/auth", authRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("MongoDB connected");
  app.listen(process.env.PORT || 5000, () =>
    console.log(`Server running on port ${process.env.PORT || 5000}`),
  );
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
