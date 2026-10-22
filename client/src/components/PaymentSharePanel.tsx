import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';

type Props = {
  dealId: string;
  status: string;
  role: 'BRAND' | 'INFLUENCER';
  otherName?: string;
  payments?: { advance?: number; final?: number };
};

type PaymentDetails = {
  accountHolderName?: string;
  upiId?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
};

type ViewResponse = {
  details: PaymentDetails;
  amountDue: number;
  currency: string;
  upiUri?: string | null;
};

const currentStage = (status: string): 'ADVANCE' | 'FINAL' | null => {
  if (status === 'ACCEPTED') return 'ADVANCE';
  if (status === 'LINK_VERIFIED') return 'FINAL';
  return null;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button button-secondary button-small"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export default function PaymentSharePanel({ dealId, status, role, otherName, payments }: Props) {
  const stage = currentStage(status);
  const [detailsSaved, setDetailsSaved] = useState<boolean | null>(null);
  const [view, setView] = useState<ViewResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setView(null);
    setQrDataUrl('');
    setError('');
    if (role === 'INFLUENCER') {
      api<{ details: PaymentDetails | null }>('/payment-details/me')
        .then((response) => setDetailsSaved(Boolean(response.details)))
        .catch(() => setDetailsSaved(null));
    } else {
      setDetailsSaved(null);
    }
  }, [dealId, role, status]);

  const showPaymentDetails = async () => {
    if (!stage) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<ViewResponse>(`/payment-shares/deal/${dealId}/${stage.toLowerCase()}/view`);
      setView(data);
      setQrDataUrl(data.upiUri ? await QRCode.toDataURL(data.upiUri, { width: 220, margin: 1 }) : '');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not load payment details. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!stage) return null;
  const amountPaise = stage === 'ADVANCE' ? payments?.advance : payments?.final;
  const stageName = stage === 'ADVANCE' ? 'advance' : 'final payment';

  return (
    <section className="card payment-share-panel" aria-labelledby="payment-access-title">
      <div className="card-header">
        <div>
          <h3 id="payment-access-title">Payment details</h3>
          <p className="muted">Payment details are available to the brand at the relevant payment stage.</p>
        </div>
      </div>

      {stage && role === 'INFLUENCER' && (
        <div className="payment-share-stage">
          <p>
            {otherName ? `${otherName} can view your saved payment details` : 'The brand can view your saved payment details'}
            {' '}for this deal’s {stageName}.
          </p>
          {detailsSaved === false && (
            <p className="notice notice-warning">
              Payment details are not saved. <Link to="/influencer/payment-details">Add payment details</Link> before the brand makes this payment.
            </p>
          )}
          <p className="muted">You do not need to create or approve a temporary share.</p>
        </div>
      )}

      {stage && role === 'BRAND' && (
        <div className="payment-share-stage">
          <p>View the creator’s saved payment details for this deal’s {stageName}.</p>
          {typeof amountPaise === 'number' && (
            <p><strong>Amount due:</strong> ₹{(amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          )}
          {!view ? (
            <button type="button" className="btn btn-primary payment-share-show" onClick={showPaymentDetails} disabled={busy}>
              {busy ? 'Loading…' : 'Show payment details'}
            </button>
          ) : (
            <div className="payment-share-details">
              <button type="button" className="button button-secondary button-small" onClick={() => { setView(null); setQrDataUrl(''); }}>
                Hide details
              </button>
              <dl>
                {view.details.accountHolderName && <><dt>Account holder</dt><dd>{view.details.accountHolderName}</dd></>}
                {view.details.upiId && <><dt>UPI ID</dt><dd>{view.details.upiId} <CopyButton value={view.details.upiId} label="Copy UPI ID" /></dd></>}
                {view.details.bankName && <><dt>Bank</dt><dd>{view.details.bankName}</dd></>}
                {view.details.accountNumber && <><dt>Account number</dt><dd>{view.details.accountNumber} <CopyButton value={view.details.accountNumber} label="Copy account number" /></dd></>}
                {view.details.ifsc && <><dt>IFSC</dt><dd>{view.details.ifsc} <CopyButton value={view.details.ifsc} label="Copy IFSC" /></dd></>}
              </dl>
              {qrDataUrl && <div className="payment-share-qr"><img src={qrDataUrl} alt="UPI payment QR code" /><p>Scan to pay ₹{(view.amountDue / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>}
              {view.upiUri && <a className="button button-secondary" href={view.upiUri}>Open UPI app</a>}
            </div>
          )}
        </div>
      )}

      {error && <p className="notice notice-error" role="alert">{error}</p>}

    </section>
  );
}
