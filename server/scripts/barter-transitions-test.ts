import { nextStatus } from "../src/modules/deals/deal.transitions";
import type {
  Actor,
  DealAction,
  DealStatus,
} from "../src/modules/deals/deal.transitions";

let failed = false;
const check = (name: string, ok: boolean) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

const barter = { paid: false };

check(
  "Paid: accept leads to ACCEPTED",
  nextStatus("OFFERED", "accept", "INFLUENCER") === "ACCEPTED",
);
check(
  "Paid (stated explicitly): accept leads to ACCEPTED",
  nextStatus("OFFERED", "accept", "INFLUENCER", { paid: true }) === "ACCEPTED",
);
check(
  "Barter: accept goes straight to IN_PROGRESS",
  nextStatus("OFFERED", "accept", "INFLUENCER", barter) === "IN_PROGRESS",
);
check(
  "Barter: only the influencer can accept",
  nextStatus("OFFERED", "accept", "BRAND", barter) === null,
);

check(
  "Paid: verifying the link leads to LINK_VERIFIED",
  nextStatus("LINK_SUBMITTED", "verifyLink", "BRAND") === "LINK_VERIFIED",
);
check(
  "Barter: verifying the link completes the deal",
  nextStatus("LINK_SUBMITTED", "verifyLink", "BRAND", barter) === "COMPLETED",
);

check(
  "Barter: marking the advance sent is refused",
  nextStatus("ACCEPTED", "markAdvanceSent", "BRAND", barter) === null,
);
check(
  "Barter: confirming an advance is refused",
  nextStatus("ADVANCE_SENT", "confirmAdvance", "INFLUENCER", barter) === null,
);
check(
  "Barter: rejecting an advance is refused",
  nextStatus("ADVANCE_SENT", "rejectAdvance", "INFLUENCER", barter) === null,
);
check(
  "Barter: marking the final payment sent is refused",
  nextStatus("LINK_VERIFIED", "markFinalSent", "BRAND", barter) === null,
);
check(
  "Barter: confirming the final payment is refused",
  nextStatus("FINAL_SENT", "confirmFinal", "INFLUENCER", barter) === null,
);
check(
  "Barter: rejecting the final payment is refused",
  nextStatus("FINAL_SENT", "rejectFinal", "INFLUENCER", barter) === null,
);

check(
  "Barter: submitting a draft still works",
  nextStatus("IN_PROGRESS", "submitDraft", "INFLUENCER", barter) ===
    "DRAFT_SUBMITTED",
);
check(
  "Barter: a dispute still works while in progress",
  nextStatus("IN_PROGRESS", "dispute", "BRAND", barter) === "DISPUTED",
);
check(
  "Barter: the brand can cancel an unanswered offer",
  nextStatus("OFFERED", "cancel", "BRAND", barter) === "CANCELLED",
);
check(
  "Barter: a completed deal cannot change",
  nextStatus("COMPLETED", "verifyLink", "BRAND", barter) === null,
);

// A full barter journey, with change rounds and a rejected link
const journey: [DealAction, Actor][] = [
  ["accept", "INFLUENCER"],
  ["submitDraft", "INFLUENCER"],
  ["requestChanges", "BRAND"],
  ["submitDraft", "INFLUENCER"],
  ["approveDraft", "BRAND"],
  ["submitLink", "INFLUENCER"],
  ["rejectLink", "BRAND"],
  ["submitLink", "INFLUENCER"],
  ["verifyLink", "BRAND"],
];
let status: DealStatus | null = "OFFERED";
for (const [action, actor] of journey) {
  if (status === null) break;
  status = nextStatus(status, action, actor, barter);
}
check("A full barter journey ends in COMPLETED", status === "COMPLETED");

console.log(failed ? "\nSome checks FAILED" : "\nAll checks passed");
process.exit(failed ? 1 : 0);
