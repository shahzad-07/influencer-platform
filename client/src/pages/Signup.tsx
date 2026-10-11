import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../context/AuthContext";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>("BRAND");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
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
    <div style={{ maxWidth: 400, margin: "40px auto", padding: 16 }}>
      <h1>Create your account</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setRole("BRAND")}
          aria-pressed={role === "BRAND"}
          style={{ flex: 1, fontWeight: role === "BRAND" ? "bold" : "normal" }}
        >
          I'm a Brand
        </button>
        <button
          type="button"
          onClick={() => setRole("INFLUENCER")}
          aria-pressed={role === "INFLUENCER"}
          style={{
            flex: 1,
            fontWeight: role === "INFLUENCER" ? "bold" : "normal",
          }}
        >
          I'm an Influencer
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          placeholder={role === "BRAND" ? "Brand / company name" : "Your name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
