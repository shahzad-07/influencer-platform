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
    <div className="terms">
      {paid && (
        <>
          <strong>Payment terms</strong>
          <ul>
            <li>
              Advance
              {amounts
                ? ` (${amounts.advancePercent}%): ${formatRupees(amounts.advance)}`
                : ""}
              . Due right after the creator accepts, before any work starts.
            </li>
            <li>
              Final
              {amounts ? `: ${formatRupees(amounts.final)}` : ""}. Due after the
              brand verifies that the post is live.
            </li>
            <li>
              Payments are made directly between the brand and the creator,
              outside this app (for example by UPI or bank transfer). The app
              does not hold or move any money. It only records them: the brand
              marks the payment as sent after paying (adding the payment
              reference, such as a UTR, is optional), and the creator confirms
              that it arrived.
            </li>
          </ul>
        </>
      )}

      {hasBarter && (
        <div className={paid ? "terms-gap" : undefined}>
          <strong>
            {paid ? "Also included for the creator" : "What the creator gets"}
          </strong>
          <div className="terms-text">
            {barterDescription?.trim() || "Not described yet"}
          </div>
          {!paid && (
            <div className="muted small">No money is paid in this deal.</div>
          )}
        </div>
      )}
    </div>
  );
}
