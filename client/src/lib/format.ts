// Money is stored in paise; show it as rupees
export const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

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
