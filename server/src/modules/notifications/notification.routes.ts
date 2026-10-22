import { Router } from "express";
import mongoose from "mongoose";
import { authenticate } from "../auth/auth.middleware";
import { NotificationModel } from "./notification.model";

const router = Router();

router.use(authenticate);

// Return only this user's newest notifications and total unread count.
router.get("/", async (req, res) => {
  const recipient = req.user!.userId;
  const [notifications, unreadCount] = await Promise.all([
    NotificationModel.find({ recipient })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate<{ deal: { _id: mongoose.Types.ObjectId; title: string } | null }>(
        "deal",
        "title",
      )
      .populate<{ campaign: { _id: mongoose.Types.ObjectId; title: string } | null }>(
        "campaign",
        "title",
      )
      .lean(),
    NotificationModel.countDocuments({ recipient, readAt: null }),
  ]);

  res.json({
    unreadCount,
    notifications: notifications.map((notification) => ({
      id: String(notification._id),
      dealId: notification.deal ? String(notification.deal._id) : null,
      campaignId: notification.campaign ? String(notification.campaign._id) : null,
      dealTitle: notification.deal?.title ?? notification.campaign?.title ?? "Deal",
      action: notification.action,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    })),
  });
});

// Mark one of the current user's notifications as read. Safe to repeat.
router.patch("/:id/read", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ message: "Notification not found" });
  }

  const filter = { _id: id, recipient: req.user!.userId };
  let notification = await NotificationModel.findOneAndUpdate(
    { ...filter, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  )
    .select("_id readAt")
    .lean();

  if (!notification) {
    notification = await NotificationModel.findOne(filter)
      .select("_id readAt")
      .lean();
  }
  if (!notification) {
    return res.status(404).json({ message: "Notification not found" });
  }

  res.json({ id: String(notification._id), readAt: notification.readAt });
});

export default router;
