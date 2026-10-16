import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

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
        "Delete your payment details? Any active share with a brand will end.",
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

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/influencer">← Back to dashboard</Link>
      </p>
      <h1>Payment details</h1>
      <p style={{ color: "gray" }}>
        These are private. A brand sees them only when you click{" "}
        <strong>Share</strong> on a deal, and only for 6 hours. You can end a
        share early.
      </p>

      {saved && (
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 12,
            margin: "12px 0",
          }}
        >
          <strong>Saved details</strong>
          <div>Name: {saved.accountHolderName}</div>
          {saved.bankName && <div>Bank: {saved.bankName}</div>}
          {saved.accountNumberLast4 && (
            <div>Account: ending {saved.accountNumberLast4}</div>
          )}
          {saved.ifsc && <div>IFSC: {saved.ifsc}</div>}
          {saved.upiId && <div>UPI ID: {saved.upiId}</div>}
          <div style={{ color: "gray", fontSize: 13 }}>
            Last updated {new Date(saved.updatedAt).toLocaleString()}
          </div>
        </div>
      )}

      <h2>{saved ? "Update details" : "Add details"}</h2>
      <form
        onSubmit={handleSubmit}
        style={{ display: "grid", gap: 12 }}
        autoComplete="off"
      >
        <label>
          Account holder name (as in your bank)
          <input
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            maxLength={100}
            required
            autoComplete="off"
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Bank name (optional)
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            maxLength={100}
            autoComplete="off"
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Account number
          <input
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
            style={{ width: "100%" }}
          />
        </label>

        <label>
          IFSC code
          <input
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value.toUpperCase())}
            placeholder="HDFC0001234"
            maxLength={11}
            autoComplete="off"
            style={{ width: "100%" }}
          />
        </label>

        <label>
          UPI ID
          <input
            value={upiId}
            onChange={(e) => setUpiId(e.target.value.trim())}
            placeholder="name@bank"
            maxLength={100}
            autoComplete="off"
            autoCapitalize="none"
            style={{ width: "100%" }}
          />
        </label>

        <p style={{ color: "gray", margin: 0 }}>
          Provide a UPI ID, or an account number with its IFSC code (or both).
          Saving replaces everything above.
        </p>

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        {message && <p style={{ color: "green", margin: 0 }}>{message}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save details"}
          </button>
          {saved && (
            <button type="button" onClick={handleDelete}>
              Delete my details
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
