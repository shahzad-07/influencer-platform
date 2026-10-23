import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SiteHeader from "../components/SiteHeader";
import SlowNotice from "../components/SlowNotice";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(
        user.role === "ADMIN"
          ? "/admin"
          : user.role === "BRAND"
            ? "/brand"
            : "/influencer",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="page-narrow">
        <div className="card auth-card stack">
          <h1>Log in</h1>

          <form className="stack" onSubmit={handleSubmit}>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

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
              {submitting ? "Logging in..." : "Log in"}
            </button>

            {/* Appears only if the server takes more than a few seconds */}
            {submitting && <SlowNotice />}
          </form>

          <p className="auth-foot">
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </div>
      </main>
    </>
  );
}
