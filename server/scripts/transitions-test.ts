import {
  nextStatus,
  isNoteRequired,
  TRANSITIONS,
  DEAL_STATUSES,
  TERMINAL_STATUSES,
} from "../src/modules/deals/deal.transitions";
import type {
  Actor,
  DealAction,
  DealStatus,
} from "../src/modules/deals/deal.transitions";
import { splitPayment } from "../src/modules/deals/deal.model";

let failed = false;
const check = (name: string, ok: boolean) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

// Permissions
check(
  "Influencer can accept an offer",
  nextStatus("OFFERED", "accept", "INFLUENCER") === "ACCEPTED",
);
check(
  "Brand cannot accept its own offer",
  nextStatus("OFFERED", "accept", "BRAND") === null,
);
check(
  "Only the brand can mark the advance sent",
  nextStatus("ACCEPTED", "markAdvanceSent", "INFLUENCER") === null,
);
check(
  "Brand cannot confirm its own advance",
  nextStatus("ADVANCE_SENT", "confirmAdvance", "BRAND") === null,
);
check(
  "Influencer confirms the advance",
  nextStatus("ADVANCE_SENT", "confirmAdvance", "INFLUENCER") === "IN_PROGRESS",
);
check(
  "'Not received' sends the deal back to ACCEPTED",
  nextStatus("ADVANCE_SENT", "rejectAdvance", "INFLUENCER") === "ACCEPTED",
);
check(
  "Influencer cannot approve their own draft",
  nextStatus("DRAFT_SUBMITTED", "approveDraft", "INFLUENCER") === null,
);
check(
  "Cannot approve a draft that was never submitted",
  nextStatus("IN_PROGRESS", "approveDraft", "BRAND") === null,
);

// Cancel, expire, dispute
check(
  "Brand can cancel before the advance is sent",
  nextStatus("ACCEPTED", "cancel", "BRAND") === "CANCELLED",
);
check(
  "Brand cannot cancel once the advance is claimed sent",
  nextStatus("ADVANCE_SENT", "cancel", "BRAND") === null,
);
check(
  "Only SYSTEM can expire an offer",
  nextStatus("OFFERED", "expire", "BRAND") === null,
);
check(
  "SYSTEM expires an unanswered offer",
  nextStatus("OFFERED", "expire", "SYSTEM") === "EXPIRED",
);
check(
  "Cannot expire an accepted deal",
  nextStatus("ACCEPTED", "expire", "SYSTEM") === null,
);
check(
  "Brand can dispute after advance sent",
  nextStatus("ADVANCE_SENT", "dispute", "BRAND") === "DISPUTED",
);
check(
  "Influencer can dispute after advance sent",
  nextStatus("ADVANCE_SENT", "dispute", "INFLUENCER") === "DISPUTED",
);
check(
  "Cannot dispute before any money is involved",
  nextStatus("ACCEPTED", "dispute", "BRAND") === null,
);
check(
  "Completed deals cannot change",
  nextStatus("COMPLETED", "verifyLink", "BRAND") === null,
);

// Comments
check(
  "Requesting changes requires a comment",
  isNoteRequired("requestChanges"),
);
check("Rejecting a link requires a comment", isNoteRequired("rejectLink"));
check("Disputes require a comment", isNoteRequired("dispute"));
check("Accepting does not require a comment", !isNoteRequired("accept"));

// Full journey, with two change rounds, a rejected link, and a 'not received' final payment
const journey: [DealAction, Actor][] = [
  ["accept", "INFLUENCER"],
  ["markAdvanceSent", "BRAND"],
  ["rejectAdvance", "INFLUENCER"],
  ["markAdvanceSent", "BRAND"],
  ["confirmAdvance", "INFLUENCER"],
  ["submitDraft", "INFLUENCER"],
  ["requestChanges", "BRAND"],
  ["submitDraft", "INFLUENCER"],
  ["requestChanges", "BRAND"],
  ["submitDraft", "INFLUENCER"],
  ["approveDraft", "BRAND"],
  ["submitLink", "INFLUENCER"],
  ["rejectLink", "BRAND"],
  ["submitLink", "INFLUENCER"],
  ["verifyLink", "BRAND"],
  ["markFinalSent", "BRAND"],
  ["rejectFinal", "INFLUENCER"],
  ["markFinalSent", "BRAND"],
  ["confirmFinal", "INFLUENCER"],
];
let status: DealStatus | null = "OFFERED";
for (const [action, actor] of journey) {
  if (status === null) break;
  status = nextStatus(status, action, actor);
}
check(
  "Full journey (with repeated rounds) ends in COMPLETED",
  status === "COMPLETED",
);

// Structure of the table
const reachable = new Set<DealStatus>(["OFFERED"]);
let grew = true;
while (grew) {
  grew = false;
  for (const t of Object.values(TRANSITIONS)) {
    if (t.from.some((s) => reachable.has(s)) && !reachable.has(t.to)) {
      reachable.add(t.to);
      grew = true;
    }
  }
}
check(
  "Every status can be reached from OFFERED",
  DEAL_STATUSES.every((s) => reachable.has(s)),
);

const canLeave = (s: DealStatus) =>
  Object.values(TRANSITIONS).some((t) => t.from.includes(s));
check(
  "Every non-final status has a way out",
  DEAL_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s)).every(canLeave),
);
check(
  "Final statuses have no way out",
  TERMINAL_STATUSES.every((s) => !canLeave(s)),
);

// Money
check(
  "50% split of 500001 paise adds up",
  (() => {
    const s = splitPayment(500001, 50);
    return s.advance + s.final === 500001;
  })(),
);

console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
process.exit(failed ? 1 : 0);
