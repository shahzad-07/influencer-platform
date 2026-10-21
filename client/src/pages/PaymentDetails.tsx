import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";

interface SavedDetails {
  accountHolderName: string;
  bankName: string;
  accountNumberLast4: string; // the full number is never sent back
  ifsc: string;
  upiId: string;
  updatedAt: string;
}

export default function PaymentDetails() {
  const [saved, setSaved] = useState<SavedDetails | null>(null);

  const [holderName, setHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Fill the form from the saved (masked) details. The account number stays empty.
  function fillForm(d: SavedDetails | null) {
    setHolderName(d?.accountHolderName ?? "");
    setBankName(d?.bankName ?? "");
    setIfsc(d?.ifsc ?? "");
    setUpiId(d?.upiId ?? "");
    setAccountNumber("");
  }

  useEffect(() => {
    api<{ details: SavedDetails | null }>("/payment-details/me")
      .then(({ details }) => {
        setSaved(details);
        fillForm(details);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load details"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    // Saving replaces everything, so don't let a blank account number wipe it by accident
    if (accountNumber === "" && ifsc.trim() !== "") {
      setError(
        "Enter your full account number again (for safety, the saved one is never shown). " +
          "To use UPI only, clear the IFSC code too.",
      );
      return;
    }

    setSaving(true);
    try {
      const res = await api<{ details: SavedDetails }>("/payment-details/me", {
        method: "PUT",
        body: JSON.stringify({
          accountHolderName: holderName,
          bankName,
          accountNumber,
          ifsc,
          upiId,
        }),
      });
      setSaved(res.details);
      fillForm(res.details); // clears the account number from the screen
      setMessage("Payment details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save details");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete your saved payment details? A brand will no longer be able to view them for future payment stages.",
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await api("/payment-details/me", { method: "DELETE" });
      setSaved(null);
      fillForm(null);
      setMessage("Payment details deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete details");
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <p className="muted">Loading...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="stack form-wide">
        <div>
          <h1>Payment details</h1>
          <p className="muted">
            These are private. For a paid deal, the brand can view your saved
            details at the relevant payment stage. Each view is recorded.
          </p>
        </div>

        {saved && (
          <section className="card stack">
            <h2 className="h-sm">Saved details</h2>
            <div>Name: {saved.accountHolderName}</div>
            {saved.bankName && <div>Bank: {saved.bankName}</div>}
            {saved.accountNumberLast4 && (
              <div>Account: ending {saved.accountNumberLast4}</div>
            )}
            {saved.ifsc && <div>IFSC: {saved.ifsc}</div>}
            {saved.upiId && <div>UPI ID: {saved.upiId}</div>}
            <div className="muted small">
              Last updated {new Date(saved.updatedAt).toLocaleString()}
            </div>
          </section>
        )}

        <form className="stack" onSubmit={handleSubmit} autoComplete="off">
          <h2 className="h-sm">{saved ? "Update details" : "Add details"}</h2>

          <div className="field">
            <label htmlFor="holder">
              Account holder name (as in your bank)
            </label>
            <input
              id="holder"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              maxLength={100}
              required
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="bank">Bank name (optional)</label>
            <input
              id="bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="account">Account number</label>
            <input
              id="account"
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/\D/g, ""))
              }
              placeholder={
                saved?.accountNumberLast4
                  ? `Saved, ending ${saved.accountNumberLast4}. Type it again to keep it.`
                  : "9 to 18 digits"
              }
              inputMode="numeric"
              maxLength={18}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="ifsc">IFSC code</label>
            <input
              id="ifsc"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
              maxLength={11}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="upi">UPI ID</label>
            <input
              id="upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value.trim())}
              placeholder="name@bank"
              maxLength={100}
              autoComplete="off"
              autoCapitalize="none"
            />
          </div>

          <p className="muted">
            Provide a UPI ID, or an account number with its IFSC code (or both).
            Saving replaces everything above.
          </p>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}

          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save details"}
            </button>
            {saved && (
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleDelete}
              >
                Delete my details
              </button>
            )}
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
