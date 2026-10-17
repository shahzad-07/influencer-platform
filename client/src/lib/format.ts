// Money is stored in paise; show it as rupees
export const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

// What the brand offers in return for the content
export type CollabType = "PAID" | "BARTER" | "PAID_AND_BARTER";

export const COLLAB_LABELS: Record<CollabType, string> = {
  PAID: "Paid",
  BARTER: "Barter",
  PAID_AND_BARTER: "Paid + Barter",
};

// Old deals may not have a type yet, and those are paid
export const collabLabel = (type?: string | null) =>
  COLLAB_LABELS[(type as CollabType) ?? "PAID"] ?? "Paid";

// Does money change hands? (everything except barter-only)
export const hasMoney = (type?: string | null) => type !== "BARTER";

// Same check under the name your other pages already use
export const isPaidType = hasMoney;

// What to show where an amount normally goes
export const amountLabel = (paise: number, type?: string | null) => {
  if (type === "BARTER") return "Barter";
  if (type === "PAID_AND_BARTER") return `${formatRupees(paise)} + Barter`;
  return formatRupees(paise);
};

const STATUS_LABELS: Record<string, string> = {
  OFFERED: "Offer sent",
  ACCEPTED: "Accepted, advance due",
  ADVANCE_SENT: "Advance sent, awaiting confirmation",
  IN_PROGRESS: "In progress",
  DRAFT_SUBMITTED: "Draft submitted",
  CHANGES_REQUESTED: "Changes requested",
  DRAFT_APPROVED: "Draft approved, post due",
  LINK_SUBMITTED: "Link submitted",
  LINK_VERIFIED: "Link verified, final payment due",
  FINAL_SENT: "Final payment sent, awaiting confirmation",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  DISPUTED: "Disputed",
};

export const statusLabel = (status: string) =>
  STATUS_LABELS[status] ?? status.replaceAll("_", " ").toLowerCase();
