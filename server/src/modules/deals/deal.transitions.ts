export const DEAL_STATUSES = [
  "OFFERED",
  "ACCEPTED",
  "ADVANCE_SENT",
  "IN_PROGRESS",
  "DRAFT_SUBMITTED",
  "CHANGES_REQUESTED",
  "DRAFT_APPROVED",
  "LINK_SUBMITTED",
  "LINK_VERIFIED",
  "FINAL_SENT",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];
export type Actor = "BRAND" | "INFLUENCER" | "SYSTEM";

export const DEAL_ACTIONS = [
  "accept",
  "decline",
  "cancel",
  "expire",
  "markAdvanceSent",
  "confirmAdvance",
  "rejectAdvance",
  "submitDraft",
  "requestChanges",
  "approveDraft",
  "submitLink",
  "rejectLink",
  "verifyLink",
  "markFinalSent",
  "confirmFinal",
  "rejectFinal",
  "dispute",
] as const;

export type DealAction = (typeof DEAL_ACTIONS)[number];

interface Transition {
  actors: Actor[]; // who may do this
  from: DealStatus[]; // from which statuses
  to: DealStatus; // where it leads
  noteRequired?: boolean; // the actor must write a comment
}

// Statuses where money may already be involved, so a dispute makes sense
const DISPUTABLE: DealStatus[] = [
  "ADVANCE_SENT",
  "IN_PROGRESS",
  "DRAFT_SUBMITTED",
  "CHANGES_REQUESTED",
  "DRAFT_APPROVED",
  "LINK_SUBMITTED",
  "LINK_VERIFIED",
  "FINAL_SENT",
];

export const TRANSITIONS: Record<DealAction, Transition> = {
  // Offer stage
  accept: { actors: ["INFLUENCER"], from: ["OFFERED"], to: "ACCEPTED" },
  decline: { actors: ["INFLUENCER"], from: ["OFFERED"], to: "DECLINED" },
  cancel: { actors: ["BRAND"], from: ["OFFERED", "ACCEPTED"], to: "CANCELLED" },
  expire: { actors: ["SYSTEM"], from: ["OFFERED"], to: "EXPIRED" },

  // Advance payment (paid outside the app, confirmed by both sides)
  markAdvanceSent: {
    actors: ["BRAND"],
    from: ["ACCEPTED"],
    to: "ADVANCE_SENT",
  },
  confirmAdvance: {
    actors: ["INFLUENCER"],
    from: ["ADVANCE_SENT"],
    to: "IN_PROGRESS",
  },
  rejectAdvance: {
    actors: ["INFLUENCER"],
    from: ["ADVANCE_SENT"],
    to: "ACCEPTED",
  },

  // Draft (any number of change rounds)
  submitDraft: {
    actors: ["INFLUENCER"],
    from: ["IN_PROGRESS", "CHANGES_REQUESTED"],
    to: "DRAFT_SUBMITTED",
  },
  requestChanges: {
    actors: ["BRAND"],
    from: ["DRAFT_SUBMITTED"],
    to: "CHANGES_REQUESTED",
    noteRequired: true, // the brand lists what to change
  },
  approveDraft: {
    actors: ["BRAND"],
    from: ["DRAFT_SUBMITTED"],
    to: "DRAFT_APPROVED",
  },

  // Posted link
  submitLink: {
    actors: ["INFLUENCER"],
    from: ["DRAFT_APPROVED"],
    to: "LINK_SUBMITTED",
  },
  rejectLink: {
    actors: ["BRAND"],
    from: ["LINK_SUBMITTED"],
    to: "DRAFT_APPROVED",
    noteRequired: true,
  },
  verifyLink: {
    actors: ["BRAND"],
    from: ["LINK_SUBMITTED"],
    to: "LINK_VERIFIED",
  },

  // Final payment (paid outside the app, confirmed by both sides)
  markFinalSent: {
    actors: ["BRAND"],
    from: ["LINK_VERIFIED"],
    to: "FINAL_SENT",
  },
  confirmFinal: {
    actors: ["INFLUENCER"],
    from: ["FINAL_SENT"],
    to: "COMPLETED",
  },
  rejectFinal: {
    actors: ["INFLUENCER"],
    from: ["FINAL_SENT"],
    to: "LINK_VERIFIED",
  },

  // Either side can raise a dispute once money may be involved
  dispute: {
    actors: ["BRAND", "INFLUENCER"],
    from: DISPUTABLE,
    to: "DISPUTED",
    noteRequired: true,
  },
};

// Statuses with no way out. DISPUTED is final for now; an admin
// resolution step will be added before launch.
export const TERMINAL_STATUSES: DealStatus[] = [
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
];

// The actions that move money. A barter-only deal never uses them.
export const PAYMENT_ACTIONS: DealAction[] = [
  "markAdvanceSent",
  "confirmAdvance",
  "rejectAdvance",
  "markFinalSent",
  "confirmFinal",
  "rejectFinal",
];

// Does money change hands in this deal? (false for barter-only)
export interface DealTerms {
  paid: boolean;
}

// Returns the next status, or null if this actor can't do this action right now
export function nextStatus(
  current: DealStatus,
  action: DealAction,
  actor: Actor,
  terms: DealTerms = { paid: true },
): DealStatus | null {
  const t = TRANSITIONS[action];
  if (!t || !t.actors.includes(actor) || !t.from.includes(current)) return null;

  if (!terms.paid) {
    // Barter-only: no payment steps, work starts on acceptance, and the deal
    // is complete once the brand verifies the post is live
    if (PAYMENT_ACTIONS.includes(action)) return null;
    if (action === "accept") return "IN_PROGRESS";
    if (action === "verifyLink") return "COMPLETED";
  }

  return t.to;
}

export function isNoteRequired(action: DealAction): boolean {
  return TRANSITIONS[action]?.noteRequired === true;
}
