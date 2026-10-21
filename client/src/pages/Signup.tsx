import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../context/AuthContext";
import SiteHeader from "../components/SiteHeader";
import SlowNotice from "../components/SlowNotice";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // The landing page links here with ?role=brand or ?role=creator
  const [role, setRole] = useState<Role>(
    params.get("role") === "creator" ? "INFLUENCER" : "BRAND",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // The browser also blocks this through the "required" checkbox
    if (!agreed) {
      setError("Please agree to the Terms to create an account.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({ name, email, password, role });
      navigate(user.role === "BRAND" ? "/brand" : "/influencer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="page-narrow">
        <div className="card auth-card stack">
          <h1>Create your account</h1>

          <div className="switch switch-full" role="group" aria-label="I am a">
            <button
              type="button"
              onClick={() => setRole("BRAND")}
              aria-pressed={role === "BRAND"}
            >
              I'm a brand
            </button>
            <button
              type="button"
              onClick={() => setRole("INFLUENCER")}
              aria-pressed={role === "INFLUENCER"}
            >
              I'm a creator
            </button>
          </div>

          <form className="stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">
                {role === "BRAND" ? "Brand or company name" : "Your name"}
              </label>
              <input
                id="name"
                autoComplete={role === "BRAND" ? "organization" : "name"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <span className="hint">At least 8 characters</span>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                required
              />
              <span>
                I agree to the{" "}
                <Link to="/terms" target="_blank" rel="noopener noreferrer">
                  Terms
                </Link>
              </span>
            </label>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating account..." : "Sign up"}
            </button>

            {/* Appears only if the server takes more than a few seconds */}
            {submitting && <SlowNotice />}
          </form>

          <p className="auth-foot">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </main>
    </>
  );
}
