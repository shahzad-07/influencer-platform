import { formatRupees, isPaidType } from "../lib/format";

interface Props {
  collaborationType?: string | null;
  barterDescription?: string;
  // Left out while the amounts are not known yet (an unfinished form)
  amounts?: {
    advance: number; // paise
    final: number; // paise
    advancePercent: number;
  };
}

export default function PaymentTerms({
  collaborationType,
  barterDescription,
  amounts,
}: Props) {
  // Money is involved for everything except barter-only
  const paid = isPaidType(collaborationType);
  // Barter is involved for BARTER and PAID_AND_BARTER
  const hasBarter = (collaborationType ?? "PAID") !== "PAID";

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 12,
        margin: "16px 0",
      }}
    >
      {paid && (
        <>
          <strong>Payment terms</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            <li>
              Advance
              {amounts
                ? ` (${amounts.advancePercent}%): ${formatRupees(amounts.advance)}`
                : ""}
              . Due right after the influencer accepts, before any work starts.
            </li>
            <li>
              Final
              {amounts ? `: ${formatRupees(amounts.final)}` : ""}. Due after the
              brand verifies that the post is live.
            </li>
            <li>
              Payments are made directly between the brand and the influencer,
              outside this app (for example by UPI or bank transfer). The app
              does not hold or move any money. It only records them: the brand
              enters a payment reference (UTR) after paying, and the influencer
              confirms that it arrived.
            </li>
          </ul>
        </>
      )}

      {hasBarter && (
        <div style={{ marginTop: paid ? 12 : 0 }}>
          <strong>
            {paid
              ? "Also included for the influencer"
              : "What the influencer gets"}
          </strong>
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {barterDescription?.trim() || "Not described yet"}
          </div>
          {!paid && (
            <div style={{ color: "gray", marginTop: 4 }}>
              No money is paid in this deal.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
