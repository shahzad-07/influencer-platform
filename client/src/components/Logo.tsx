import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link className="logo" to="/" aria-label="DealDoneHai home">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="var(--primary)" />
        <path
          d="M9 16.5l5 5 9-10"
          fill="none"
          stroke="#d4f55a"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        DealDone<b>Hai</b>
      </span>
    </Link>
  );
}
